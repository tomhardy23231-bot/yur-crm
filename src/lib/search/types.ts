// Типы результатов глобального поиска (Cmd+K).
// Этот файл намеренно НЕ server-only — типы шарятся между client component
// палитры и server-only queries.ts/route handler.

export type CasePaletteItem = {
  id: string;
  number_title: string;
  stage: string;
  client_name: string | null;
};

export type ClientPaletteItem = {
  id: string;
  name: string;
  client_kind: 'individual' | 'company';
};

export type TaskPaletteItem = {
  id: string;
  title: string;
  case_id: string;
  case_number: string | null;
  status: 'open' | 'done';
};

export type DocumentPaletteItem = {
  id: string;
  file_name: string;
  doc_type: 'contract' | 'claim' | 'power_of_attorney' | 'correspondence' | 'other';
  case_id: string;
  case_number: string | null;
};

export type PaletteResults = {
  cases: CasePaletteItem[];
  clients: ClientPaletteItem[];
  tasks: TaskPaletteItem[];
  documents: DocumentPaletteItem[];
};

export const EMPTY_RESULTS: PaletteResults = {
  cases: [],
  clients: [],
  tasks: [],
  documents: [],
};

export const MAX_RESULTS_PER_GROUP = 5;
