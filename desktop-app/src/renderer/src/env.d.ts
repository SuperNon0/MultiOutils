/** Imports « texte brut » de Vite (sprites SVG du design « encre »). */
declare module '*.svg?raw' {
  const content: string;
  export default content;
}
