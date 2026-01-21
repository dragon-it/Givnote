"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLiveQuery } from "dexie-react-hooks";
import dayjs from "dayjs";
import * as XLSX from "xlsx-js-style";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { z } from "zod";
import {
  db,
  type EventType,
  type GiftRecord,
  type PaymentMethodType,
  type RelationType,
  type SideType,
} from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const eventTypes: EventType[] = ["결혼식", "조의", "돌잔치", "생일", "기타"];

const relations: RelationType[] = [
  "친구",
  "회사",
  "가족",
  "지인",
  "이웃",
  "기타",
];

const paymentMethods: PaymentMethodType[] = [
  "현금",
  "계좌이체",
  "카드",
  "페이",
  "기타",
];

const defaultSide: SideType = "신부측";

const eventSchema = z.object({
  type: z.string().min(1, "행사 타입을 선택해 주세요."),
  date: z.string().min(1, "날짜를 입력해 주세요."),
  location: z.string().min(1, "장소를 입력해 주세요."),
  host: z.string().min(1, "호스트 이름을 입력해 주세요."),
});

const recordSchema = z.object({
  name: z.string().min(1, "이름을 입력해 주세요."),
  amount: z.preprocess(
    (value) => (value === "" ? undefined : Number(value)),
    z.number().min(1, "금액을 입력해 주세요."),
  ),
  relation: z.string().optional(),
  companions: z.preprocess(
    (value) =>
      value === "" || value === undefined || value === null ? 1 : Number(value),
    z.number().int().min(0, "동반인 수는 0 이상이어야 합니다."),
  ),
  paymentMethod: z.string().optional(),
  memo: z.string().optional(),
});

type EventFormValues = z.infer<typeof eventSchema>;

const formatMoney = (value: number) => value.toLocaleString("ko-KR");

type ExportRow = {
  번호: number | string;
  이름: string;
  금액: number | string;
  인원수: number | string;
};

export default function Home() {
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [relationFilter, setRelationFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [inlineForm, setInlineForm] = useState({
    name: "",
    amount: "",
    relation: "기타",
    companions: "1",
    paymentMethod: "현금",
    memo: "",
  });
  const [inlineError, setInlineError] = useState("");
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState<{
    name: string;
    amount: string;
    relation: string;
    companions: string;
    paymentMethod: string;
    memo: string;
  } | null>(null);
  const [editError, setEditError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const eventsQuery = useLiveQuery(() => db.events.toArray(), []);
  const recordsQuery = useLiveQuery(
    () =>
      selectedEventId
        ? db.records.where("eventId").equals(selectedEventId).toArray()
        : [],
    [selectedEventId],
  );
  const events = useMemo(() => eventsQuery ?? [], [eventsQuery]);
  const records = useMemo(() => recordsQuery ?? [], [recordsQuery]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  useEffect(() => {
    if (!selectedEventId && events.length > 0) {
      setSelectedEventId(events[0]?.id ?? null);
    }
  }, [events, selectedEventId]);

  const eventForm = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      type: eventTypes[0],
      date: dayjs().format("YYYY-MM-DD"),
      location: "",
      host: "",
    },
  });

  const filteredRecords = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return records.filter((record) => {
      if (relationFilter !== "all" && record.relation !== relationFilter) {
        return false;
      }
      if (paymentFilter !== "all" && record.paymentMethod !== paymentFilter) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }

      const nameMatch = record.name.toLowerCase().includes(normalizedSearch);
      const memoMatch = (record.memo ?? "")
        .toLowerCase()
        .includes(normalizedSearch);
      return nameMatch || memoMatch;
    });
  }, [records, search, relationFilter, paymentFilter]);

  const totals = useMemo(() => {
    const totalAmount = filteredRecords.reduce(
      (sum, record) => sum + record.amount,
      0,
    );
    const totalCount = filteredRecords.length;
    const totalCompanions = filteredRecords.reduce(
      (sum, record) => sum + (record.companions ?? 1),
      0,
    );
    const totalPeople = totalCompanions;
    const byRelation = new Map<string, number>();
    const byMethod = new Map<string, number>();

    filteredRecords.forEach((record) => {
      if (record.relation) {
        byRelation.set(
          record.relation,
          (byRelation.get(record.relation) ?? 0) + record.amount,
        );
      }
      if (record.paymentMethod) {
        byMethod.set(
          record.paymentMethod,
          (byMethod.get(record.paymentMethod) ?? 0) + record.amount,
        );
      }
    });

    return {
      totalAmount,
      totalCount,
      totalCompanions,
      totalPeople,
      byRelation,
      byMethod,
    };
  }, [filteredRecords]);

  const handleEditStart = useCallback((record: GiftRecord) => {
    if (!record.id) {
      return;
    }
    setEditingRecordId(record.id);
    setEditingDraft({
      name: record.name,
      amount: String(record.amount),
      relation: record.relation ?? "기타",
      companions: String(record.companions ?? 1),
      paymentMethod: record.paymentMethod ?? "현금",
      memo: record.memo ?? "",
    });
    setEditError("");
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingRecordId(null);
    setEditingDraft(null);
    setEditError("");
  }, []);

  const handleEditSave = useCallback(async () => {
    if (!editingRecordId || !editingDraft) {
      return;
    }

    const parsed = recordSchema.safeParse({
      name: editingDraft.name,
      amount: editingDraft.amount,
      relation: editingDraft.relation || undefined,
      companions: editingDraft.companions,
      paymentMethod: editingDraft.paymentMethod || undefined,
      memo: editingDraft.memo,
    });

    if (!parsed.success) {
      setEditError(
        parsed.error.issues[0]?.message ?? "입력값이 유효하지 않습니다.",
      );
      return;
    }

    await db.records.update(editingRecordId, {
      name: parsed.data.name,
      amount: Number(parsed.data.amount),
      relation: (parsed.data.relation as RelationType) || undefined,
      companions: parsed.data.companions,
      paymentMethod:
        (parsed.data.paymentMethod as PaymentMethodType) || undefined,
      memo: parsed.data.memo?.trim() || undefined,
    });

    handleEditCancel();
  }, [editingDraft, editingRecordId, handleEditCancel]);

  const handleEditKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.nativeEvent.isComposing) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void handleEditSave();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        handleEditCancel();
      }
    },
    [handleEditCancel, handleEditSave],
  );

  const columns = useMemo<ColumnDef<GiftRecord>[]>(
    () => [
      {
        id: "index",
        header: "번호",
        cell: ({ row }) => (
          <div className="text-xs text-slate-500">{row.index + 1}</div>
        ),
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            이름
          </Button>
        ),
        cell: ({ row }) => {
          const isEditing = row.original.id === editingRecordId;
          if (!isEditing || !editingDraft) {
            return <div className="font-medium">{row.original.name}</div>;
          }
          return (
            <Input
              value={editingDraft.name}
              onChange={(event) =>
                setEditingDraft((prev) =>
                  prev ? { ...prev, name: event.target.value } : prev,
                )
              }
              onKeyDown={handleEditKeyDown}
              className="h-8"
            />
          );
        },
      },
      {
        accessorKey: "amount",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            금액
          </Button>
        ),
        cell: ({ row }) => {
          const isEditing = row.original.id === editingRecordId;
          if (!isEditing || !editingDraft) {
            return (
              <div className="text-right tabular-nums">
                {formatMoney(row.original.amount)}원
              </div>
            );
          }
          return (
            <Input
              type="number"
              inputMode="numeric"
              value={editingDraft.amount}
              onChange={(event) =>
                setEditingDraft((prev) =>
                  prev ? { ...prev, amount: event.target.value } : prev,
                )
              }
              onKeyDown={handleEditKeyDown}
              className="h-8 text-right"
            />
          );
        },
      },
      {
        accessorKey: "relation",
        header: "관계",
        cell: ({ row }) => {
          const isEditing = row.original.id === editingRecordId;
          if (!isEditing || !editingDraft) {
            return row.original.relation ?? "-";
          }
          return (
            <Select
              value={editingDraft.relation || undefined}
              onValueChange={(value) =>
                setEditingDraft((prev) =>
                  prev ? { ...prev, relation: value } : prev,
                )
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="관계" />
              </SelectTrigger>
              <SelectContent>
                {relations.map((relation) => (
                  <SelectItem key={relation} value={relation}>
                    {relation}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        },
      },
      {
        accessorKey: "companions",
        header: "인원 수",
        cell: ({ row }) => {
          const isEditing = row.original.id === editingRecordId;
          if (!isEditing || !editingDraft) {
            return row.original.companions ?? 1;
          }
          return (
            <Input
              type="number"
              inputMode="numeric"
              value={editingDraft.companions}
              onChange={(event) =>
                setEditingDraft((prev) =>
                  prev ? { ...prev, companions: event.target.value } : prev,
                )
              }
              onKeyDown={handleEditKeyDown}
              className="h-8"
            />
          );
        },
      },
      {
        accessorKey: "paymentMethod",
        header: "전달방식",
        cell: ({ row }) => {
          const isEditing = row.original.id === editingRecordId;
          if (!isEditing || !editingDraft) {
            return row.original.paymentMethod ?? "-";
          }
          return (
            <Select
              value={editingDraft.paymentMethod || undefined}
              onValueChange={(value) =>
                setEditingDraft((prev) =>
                  prev ? { ...prev, paymentMethod: value } : prev,
                )
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue placeholder="전달 방식" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.map((method) => (
                  <SelectItem key={method} value={method}>
                    {method}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        },
      },
      {
        accessorKey: "memo",
        header: "메모",
        cell: ({ row }) => {
          const isEditing = row.original.id === editingRecordId;
          if (!isEditing || !editingDraft) {
            return row.original.memo ?? "-";
          }
          return (
            <Input
              value={editingDraft.memo}
              onChange={(event) =>
                setEditingDraft((prev) =>
                  prev ? { ...prev, memo: event.target.value } : prev,
                )
              }
              onKeyDown={handleEditKeyDown}
              className="h-8"
            />
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const isEditing = row.original.id === editingRecordId;
          if (isEditing) {
            return (
              <div className="flex gap-1">
                <Button type="button" size="sm" onClick={handleEditSave}>
                  저장
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleEditCancel}
                >
                  취소
                </Button>
              </div>
            );
          }
          return (
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleEditStart(row.original)}
              >
                수정
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (row.original.id) {
                    await db.records.delete(row.original.id);
                  }
                }}
              >
                삭제
              </Button>
            </div>
          );
        },
      },
    ],
    [
      editingDraft,
      editingRecordId,
      handleEditCancel,
      handleEditKeyDown,
      handleEditSave,
      handleEditStart,
    ],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filteredRecords,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleCreateEvent = async (values: EventFormValues) => {
    const id = await db.events.add({
      type: values.type as EventType,
      date: values.date,
      location: values.location,
      host: values.host,
      createdAt: Date.now(),
    });
    setSelectedEventId(id);
    eventForm.reset({
      type: values.type,
      date: values.date,
      location: "",
      host: "",
    });
  };

  const handleInlineAdd = async () => {
    if (!selectedEventId) {
      setInlineError("행사를 먼저 선택해 주세요.");
      return;
    }

    const parsed = recordSchema.safeParse({
      name: inlineForm.name,
      amount: inlineForm.amount,
      relation: inlineForm.relation || undefined,
      companions: inlineForm.companions,
      paymentMethod: inlineForm.paymentMethod || undefined,
      memo: inlineForm.memo,
    });

    if (!parsed.success) {
      setInlineError(
        parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
      );
      return;
    }

    await db.records.add({
      eventId: selectedEventId,
      side: defaultSide,
      name: parsed.data.name,
      amount: Number(parsed.data.amount),
      relation: (parsed.data.relation as RelationType) || undefined,
      companions: parsed.data.companions,
      paymentMethod:
        (parsed.data.paymentMethod as PaymentMethodType) || undefined,
      memo: parsed.data.memo?.trim() || undefined,
      createdAt: Date.now(),
    });

    setInlineForm((prev) => ({
      name: "",
      amount: "",
      relation: prev.relation || "기타",
      companions: "1",
      paymentMethod: prev.paymentMethod || "현금",
      memo: "",
    }));
    setInlineError("");
    requestAnimationFrame(() => nameInputRef.current?.focus());
  };

  const handleInlineKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    void handleInlineAdd();
  };

  const makeEmptyRow = (): ExportRow => ({
    번호: "",
    이름: "",
    금액: "",
    인원수: "",
  });

  const makeRows = (): ExportRow[] => {
    if (!selectedEvent) return [];

    return filteredRecords.map((record, index) => ({
      번호: index + 1,
      이름: record.name,
      금액: record.amount,
      인원수: record.companions ?? 1,
    }));
  };

  const makeSummaryRows = (): ExportRow[] => [
    makeEmptyRow(),
    { ...makeEmptyRow(), 번호: "총 금액", 금액: totals.totalAmount },
    { ...makeEmptyRow(), 번호: "총 인원수", 인원수: totals.totalPeople },
  ];

  // XLSX Export
  const exportToXlsx = () => {
    if (!selectedEvent) return;

    const rows = makeRows();
    const headers: Array<keyof ExportRow> = ["번호", "이름", "금액", "인원수"];
    const dataRows = rows.map((row) => [
      row.번호,
      row.이름,
      row.금액,
      row.인원수,
    ]);
    const aoa = [headers, ...dataRows];

    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.sheet_add_aoa(
      worksheet,
      [
        ["총 금액", totals.totalAmount],
        ["총 인원수", totals.totalPeople],
      ],
      { origin: "F3" },
    );

    const applyCellStyles = (rangeRef: string) => {
      const range = XLSX.utils.decode_range(rangeRef);
      for (let row = range.s.r; row <= range.e.r; row += 1) {
        for (let col = range.s.c; col <= range.e.c; col += 1) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          const cell = worksheet[cellAddress] ?? { t: "s", v: "" };
          cell.s = {
            ...(cell.s ?? {}),
            alignment: { horizontal: "center", vertical: "center" },
            border: {
              top: { style: "thin", color: { rgb: "CBD5E1" } },
              bottom: { style: "thin", color: { rgb: "CBD5E1" } },
              left: { style: "thin", color: { rgb: "CBD5E1" } },
              right: { style: "thin", color: { rgb: "CBD5E1" } },
            },
          };
          worksheet[cellAddress] = cell;
        }
      }
    };

    if (aoa.length > 0) {
      applyCellStyles(`A1:D${aoa.length}`);
    }
    applyCellStyles("F3:G4");

    const columnWidths = headers.map((key) => {
      const headerLen = String(key).length;
      const maxValueLen = rows.reduce(
        (max, row) => Math.max(max, String(row[key] ?? "").length),
        0,
      );
      const maxLen = Math.max(headerLen, maxValueLen);
      return { wch: Math.min(40, maxLen * 2 + 2) };
    });
    worksheet["!cols"] = [
      ...columnWidths,
      { wch: 4 },
      { wch: 10 },
      { wch: 12 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "명단");
    XLSX.writeFile(workbook, `givenote-${selectedEvent.date}.xlsx`);
  };

  // CSV Export
  const exportToCsv = () => {
    if (!selectedEvent) return;

    const rowsWithSummary: ExportRow[] = makeRows().concat(makeSummaryRows());

    const worksheet = XLSX.utils.json_to_sheet(rowsWithSummary);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "명단");
    XLSX.writeFile(workbook, `givenote-${selectedEvent.date}.csv`, {
      bookType: "csv",
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white">
              GiveNote
            </div>
            <span className="text-sm text-slate-600">하객 및 축의금 관리</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                GiveNote
              </h1>
              <p className="text-sm text-slate-600">
                행사별 명단을 관리하고 엑셀 또는 CSV로 내보내기.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={exportToCsv}
                disabled={!selectedEvent || filteredRecords.length === 0}
              >
                CSV 다운로드
              </Button>
              <Button
                onClick={exportToXlsx}
                disabled={!selectedEvent || filteredRecords.length === 0}
              >
                XLSX 다운로드
              </Button>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.7fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">행사</h2>
                <p className="text-sm text-slate-500">
                  행사 생성 후 해당 행사의 명단만 관리합니다.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label>선택된 행사</Label>
                <Select
                  value={selectedEventId ? String(selectedEventId) : undefined}
                  onValueChange={(value) => setSelectedEventId(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="행사 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {events.map((event) => (
                      <SelectItem key={event.id} value={String(event.id)}>
                        {event.type} | {event.date} | {event.location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedEvent ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="font-medium text-slate-900">
                    {selectedEvent.type}
                  </div>
                  <div>{selectedEvent.date}</div>
                  <div>{selectedEvent.location}</div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    호스트: {selectedEvent.host}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  행사를 먼저 생성해 주세요.
                </p>
              )}
            </div>

            <div className="mt-8 border-t border-slate-200 pt-6">
              <h3 className="text-base font-semibold">행사 생성</h3>
              <form
                className="mt-4 grid gap-4"
                onSubmit={eventForm.handleSubmit(handleCreateEvent)}
              >
                <div className="grid gap-2">
                  <Label>행사 타입</Label>
                  <Controller
                    control={eventForm.control}
                    name="type"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="행사 타입 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {eventTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {eventForm.formState.errors.type ? (
                    <p className="text-xs text-red-500">
                      {eventForm.formState.errors.type.message}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <Label>날짜</Label>
                  <Input type="date" {...eventForm.register("date")} />
                  {eventForm.formState.errors.date ? (
                    <p className="text-xs text-red-500">
                      {eventForm.formState.errors.date.message}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <Label>장소</Label>
                  <Input
                    placeholder="예식장/장소"
                    {...eventForm.register("location")}
                  />
                  {eventForm.formState.errors.location ? (
                    <p className="text-xs text-red-500">
                      {eventForm.formState.errors.location.message}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <Label>호스트</Label>
                  <Input
                    placeholder="본인 이름"
                    {...eventForm.register("host")}
                  />
                  {eventForm.formState.errors.host ? (
                    <p className="text-xs text-red-500">
                      {eventForm.formState.errors.host.message}
                    </p>
                  ) : null}
                </div>

                <Button type="submit">행사 추가</Button>
              </form>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.7fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">명단 리스트</h2>
                <p className="text-sm text-slate-500">
                  {filteredRecords.length} / {records.length} 건
                </p>
                {editError ? (
                  <p className="text-xs text-red-500">{editError}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3">
                <Input
                  className="w-44"
                  placeholder="이름/메모 검색"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <Select
                  value={relationFilter}
                  onValueChange={setRelationFilter}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="관계" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 관계</SelectItem>
                    {relations.map((relation) => (
                      <SelectItem key={relation} value={relation}>
                        {relation}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="전달 방식" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 방식</SelectItem>
                    {paymentMethods.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <Table className="border-collapse text-[13px]">
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id} className="bg-slate-100">
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className="border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className="even:bg-slate-50"
                        onDoubleClick={() => handleEditStart(row.original)}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            className="border-b border-slate-200 px-3"
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="py-10 text-center text-slate-500"
                      >
                        아직 등록된 명단이 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-700">
                  명단 바로 추가
                </div>
                {inlineError ? (
                  <div className="text-xs text-red-500">{inlineError}</div>
                ) : null}
              </div>
              <div className="mt-3 grid gap-2 lg:grid-cols-[1.1fr_0.8fr_0.9fr_0.8fr_0.9fr_1.2fr_auto]">
                <div className="grid gap-1">
                  <span className="text-[11px] font-medium text-slate-600">
                    이름
                  </span>
                  <Input
                    key="inline-name"
                    placeholder="이름"
                    ref={nameInputRef}
                    value={inlineForm.name}
                    onChange={(event) =>
                      setInlineForm((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    onKeyDown={handleInlineKeyDown}
                  />
                </div>
                <div className="grid gap-1">
                  <span className="text-[11px] font-medium text-slate-600">
                    금액
                  </span>
                  <Input
                    key="inline-amount"
                    type="number"
                    inputMode="numeric"
                    placeholder="금액"
                    value={inlineForm.amount}
                    onChange={(event) =>
                      setInlineForm((prev) => ({
                        ...prev,
                        amount: event.target.value,
                      }))
                    }
                    onKeyDown={handleInlineKeyDown}
                  />
                </div>
                <div className="grid gap-1">
                  <span className="text-[11px] font-medium text-slate-600">
                    관계
                  </span>
                  <Select
                    key="inline-relation"
                    value={inlineForm.relation || undefined}
                    onValueChange={(value) =>
                      setInlineForm((prev) => ({ ...prev, relation: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="관계" />
                    </SelectTrigger>
                    <SelectContent>
                      {relations.map((relation) => (
                        <SelectItem key={relation} value={relation}>
                          {relation}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <span className="text-[11px] font-medium text-slate-600">
                    인원 수
                  </span>
                  <Input
                    key="inline-companions"
                    type="number"
                    inputMode="numeric"
                    placeholder="인원 수"
                    value={inlineForm.companions}
                    onChange={(event) =>
                      setInlineForm((prev) => ({
                        ...prev,
                        companions: event.target.value,
                      }))
                    }
                    onKeyDown={handleInlineKeyDown}
                  />
                </div>
                <div className="grid gap-1">
                  <span className="text-[11px] font-medium text-slate-600">
                    전달방식
                  </span>
                  <Select
                    key="inline-payment-method"
                    value={inlineForm.paymentMethod || undefined}
                    onValueChange={(value) =>
                      setInlineForm((prev) => ({
                        ...prev,
                        paymentMethod: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="전달 방식" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((method) => (
                        <SelectItem key={method} value={method}>
                          {method}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <span className="text-[11px] font-medium text-slate-600">
                    메모
                  </span>
                  <Input
                    key="inline-memo"
                    placeholder="메모"
                    value={inlineForm.memo}
                    onChange={(event) =>
                      setInlineForm((prev) => ({
                        ...prev,
                        memo: event.target.value,
                      }))
                    }
                    onKeyDown={handleInlineKeyDown}
                  />
                </div>
                <div className="grid items-end">
                  <Button
                    type="button"
                    onClick={handleInlineAdd}
                    disabled={!selectedEventId}
                  >
                    추가
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-sm font-semibold text-slate-700">
              결산 요약
            </div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-widest text-slate-500">
                  총액
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {formatMoney(totals.totalAmount)}원
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-widest text-slate-500">
                  총 건수
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {formatMoney(totals.totalCount)}건
                </div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-widest text-slate-500">
                  총 인원
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  {formatMoney(totals.totalPeople)}명
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-500">
                관계별 합계
              </div>
              <div className="mt-2 space-y-1 text-sm text-slate-700">
                {totals.byRelation.size === 0 ? (
                  <div className="text-slate-500">데이터 없음</div>
                ) : (
                  Array.from(totals.byRelation.entries()).map(
                    ([key, value]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between"
                      >
                        <span>{key}</span>
                        <span className="font-medium">
                          {formatMoney(value)}원
                        </span>
                      </div>
                    ),
                  )
                )}
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-500">
                전달방식별 합계
              </div>
              <div className="mt-2 space-y-1 text-sm text-slate-700">
                {totals.byMethod.size === 0 ? (
                  <div className="text-slate-500">데이터 없음</div>
                ) : (
                  Array.from(totals.byMethod.entries()).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between"
                    >
                      <span>{key}</span>
                      <span className="font-medium">
                        {formatMoney(value)}원
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
