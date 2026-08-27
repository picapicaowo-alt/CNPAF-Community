import type {
  RuntimeFormField,
  RuntimeFormOption,
  RuntimeFormSection,
} from "@cnpaf/shared";

export type QuickFormSummary = {
  templateId: string;
  templateKey: string;
  templateTypeKey: string;
  organizationId?: string | null;
  versionId: string;
  version: number;
  nameEn: string;
  nameZh: string;
  descriptionEn?: string | null;
  descriptionZh?: string | null;
};

export type PackageRegistryItem = {
  registryKey: string;
  itemId: string;
  itemKey: string;
  version: number;
  labelEn: string;
  labelZh: string;
  helpTextEn?: string | null;
  helpTextZh?: string | null;
  sortOrder: number;
  metadata?: Record<string, unknown>;
};

export type QuickCapturePackage = {
  template: {
    id: string;
    organizationId?: string | null;
  };
  form: {
    version: {
      id: string;
      nameEn: string;
      nameZh: string;
      configuration: Record<string, unknown>;
    };
    sections: RuntimeFormSection[];
    fields: RuntimeFormField[];
    options: RuntimeFormOption[];
  };
  configuration: PackageRegistryItem[];
  packageVersion: string;
};

export type SiteChoice = {
  id: string;
  name: string;
  nameEn?: string | null;
  nameZh?: string | null;
  siteType: string;
  region?: string | null;
};
