# Avis de tiers (Third-party notices)

## Flow Launcher

Le module « Lanceur » de l'application (`desktop-app/src/main/modules/launcher/`,
`desktop-app/src/renderer/src/modules/launcher/`) recrée en TypeScript les
fonctions de base de [Flow Launcher](https://github.com/Flow-Launcher/Flow.Launcher).
La correspondance floue (`core/matcher.ts`) est un portage du `StringMatcher`
de Flow ; l'analyse des mots-clés, la mémoire des sélections et les
fournisseurs intégrés s'inspirent de sa logique. Aucun fichier de Flow n'est
inclus tel quel.

```
The MIT License (MIT)

Copyright (c) 2019 Flow-Launcher
Copyright (c) 2015 Wox

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Polices du design « encre »

DM Serif Display, Archivo et DM Mono (`desktop-app/src/renderer/src/encre/polices/`)
sont distribuées sous licence SIL Open Font License 1.1.
