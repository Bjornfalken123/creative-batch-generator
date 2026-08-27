declare module 'xlsx' {
  export const read: any;
  export const utils: any;
  export const set_cptable: any;
}

declare module 'xlsx/dist/cpexcel.full.mjs' {
  const cpexcel: any;
  export = cpexcel;
}
