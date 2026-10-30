import { CLIENT_SEGMENTS, type ClientSegment } from "@/lib/validation/clients";
import type { ClientListFilters } from "@/server/clients/queries";

// Фильтры списка клиентов в адресе: ?q=&tag=&master=&segment=&page=.

export type ClientFilterValues = Omit<ClientListFilters, "page">;

export function toClientSearch(values: ClientFilterValues, page = 1): string {
  const params = new URLSearchParams();
  if (values.query) params.set("q", values.query);
  if (values.tagId) params.set("tag", values.tagId);
  if (values.masterId) params.set("master", values.masterId);
  if (values.segment !== "all") params.set("segment", values.segment);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `?${search}` : "";
}

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";
const id = (value: string) => (/^[a-z0-9]{8,40}$/.test(value) ? value : null);

/** Параметры адреса → фильтры; всё непонятное заменяется значением по умолчанию. */
export function parseClientFilters(params: RawParams): ClientListFilters {
  const segment = first(params.segment);
  const page = Number.parseInt(first(params.page), 10);
  return {
    query: first(params.q).trim().slice(0, 60),
    tagId: id(first(params.tag)),
    masterId: id(first(params.master)),
    segment: (CLIENT_SEGMENTS as readonly string[]).includes(segment)
      ? (segment as ClientSegment)
      : "all",
    page: Number.isInteger(page) && page > 0 && page < 10_000 ? page : 1,
  };
}
