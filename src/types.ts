export type TemplateOption = {
  label: string;
  id: string;
};

export type Creative = {
  id: string;
  sourceComment: string;
  name: string;
  nameSource: 'script-comment' | 'file-header' | 'fallback';
  width: number;
  height: number;
  dimension: string;
  script: string;
  mappedSizeLabel: string | null;
  included: boolean;
  warnings: string[];
};

export type ParseIssue = {
  type: 'warning' | 'error';
  message: string;
};

export type ParseResult = {
  creatives: Creative[];
  issues: ParseIssue[];
  scriptCount: number;
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
