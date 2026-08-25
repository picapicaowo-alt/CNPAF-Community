export type LocationAlias = {
  id: string;
  displayAlias: string;
  language?: string | null;
};

export type Location = {
  id: string;
  organizationId?: string | null;
  name: string;
  siteType: string;
  region?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  canonicalStatus: string;
  aliases: LocationAlias[];
};

export type LocationType = {
  id: string;
  key: string;
  version: number;
  labelEn: string;
  labelZh: string;
  helpTextEn?: string | null;
  helpTextZh?: string | null;
  status: string;
  sortOrder: number;
  organizationId?: string | null;
};

export type LocationTypeDraft = {
  key: string;
  labelEn: string;
  labelZh: string;
  helpTextEn: string;
  helpTextZh: string;
  sortOrder: number;
};

export type LocationDraft = {
  name: string;
  siteType: string;
  address: string;
  city: string;
  state: string;
  country: string;
  alias: string;
};
