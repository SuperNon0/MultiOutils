/** Import brut d'un fichier (sprite d'icônes « encre »), fourni par Vite. */
declare module '*.svg?raw' {
  const content: string;
  export default content;
}
