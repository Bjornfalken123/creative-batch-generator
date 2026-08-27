export type TemplateOption = {
  label: string;
  id: string;
};

export type Creative = {
  id: string;
  sourceComment: string;
  name: string;
  width: number;
  height: number;
  dimension: string;
  script: string;
  mappedSizeLabel: string | null;
  clicktagUpdated: boolean;
};

export type TemplateConfig = {
  categories: TemplateOption[];
  sizes: TemplateOption[];
  creativeTypes: string[];
  adServers: string[];
};

export type ExportSettings = {
  category: string;
  creativeType: string;
  previewUrl: string;
  landingPage: string;
  adServer: string;
  replaceClicktag: boolean;
};
