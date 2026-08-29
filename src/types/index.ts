export interface VersionInfo {
  season: number;
  build: number;
  cl: string;
  lobby: string;
}

export interface CatalogEntry {
  devName: string;
  offerId: string;
  fulfillmentIds: string[];
  dailyLimit: number;
  weeklyLimit: number;
  monthlyLimit: number;
  categories: string[];
  prices: Record<string, unknown>[];
  meta: Record<string, unknown>;
  matchFilter: string;
  filterWeight: number;
  appStoreId: string[];
  requirements: Record<string, unknown>[];
  offerType: string;
  giftInfo: Record<string, unknown>;
  refundable: boolean;
  metaInfo: Record<string, string>[];
  displayAssetPath: string;
  itemGrants: Record<string, unknown>[];
  sortPriority: number;
  catalogGroupPriority: number;
}

export interface PartyMember {
  account_id: string;
  meta: Record<string, unknown>;
  connections: PartyConnection[];
  revision: number;
  updated_at: string;
  joined_at: string;
  role: string;
}

export interface PartyConnection {
  id: string;
  connected_at: string;
  updated_at: string;
  yield_leadership: boolean;
  meta: Record<string, unknown>;
}

export interface Party {
  id: string;
  created_at: string;
  updated_at: string;
  config: Record<string, unknown>;
  members: PartyMember[];
  applicants: unknown[];
  meta: Record<string, unknown>;
  invites: unknown[];
  revision: number;
  intentions: unknown[];
}

export interface ErrorResponse {
  errorCode: string;
  errorMessage: string;
  messageVars: unknown[];
  numericErrorCode: number;
  originatingService: string;
  intent: string;
  error_description: string;
  error?: string;
}
