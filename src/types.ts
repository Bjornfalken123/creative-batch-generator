export type TemplateOption = {
  label: string;
  id: string;
};

export type SourceType = 'seenthis' | 'adform' | 'google';
export type SizeStatus = 'matched' | 'missing' | 'ambiguous';

export type Creative = {
  id: string;
  sourceType: SourceType;
  sourceComment: string;
  name: string;
  nameSource: 'script-comment' | 'file-header' | 'adform-header' | 'google-creative' | 'google-ad' | 'google-placement' | 'fallback';
  width: number;
  height: number;
  dimension: string;
  script: string;
  sizeStatus: SizeStatus;
  sizeOptions: TemplateOption[];
  mappedSizeLabel: string | null;
  included: boolean;
  warnings: string[];
  trackingOnly?: boolean;
};

export type ParseIssue = {
  type: 'warning' | 'error';
  message: string;
};

export type ParseResult = {
  creatives: Creative[];
  issues: ParseIssue[];
  itemCount: number;
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
