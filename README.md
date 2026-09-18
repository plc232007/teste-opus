# Experimentos de direção de arte

Três exercícios de direção de arte em HTML, CSS e JavaScript puros — sem
framework, sem biblioteca de animação, sem etapa de build. A única
dependência externa são as fontes do Google Fonts.

| | Projeto | Pasta | O que é |
|---|---|---|---|
| 01 | **Adrian Vale** | [`vale/`](vale/) | Portfólio de um fundador fictício. Seis atos, visual inteiramente em código. |
| 02 | **MUSK** | [`musk/`](musk/) | Perfil documental em cinco atos, terceira pessoa, apenas fatos públicos. |

| 03 | **Elon Musk - Astra 6** | [`astra-6/`](astra-6/) | Experiência editorial com planetas procedurais em WebGL e laboratório interativo. |

A raiz (`index.html`) é o índice que leva aos três.

## Estrutura

```
.
├── index.html          índice
├── vale/index.html     projeto 01
├── musk/index.html     projeto 02
├── astra-6/           projeto 03 (HTML, CSS e JavaScript + WebGL)
├── musk/img/           fotografias do projeto 02
└── .nojekyll           impede o Jekyll de processar o site
```

Todos os caminhos são relativos, então o site funciona tanto em
`usuario.github.io/repositorio/` quanto num domínio próprio.

## Publicar no GitHub Pages

```bash
git init
git add .
git commit -m "Dois sites one-page"
git branch -M main
git remote add origin git@github.com:USUARIO/REPOSITORIO.git
git push -u origin main
```

Depois, em **Settings → Pages**, escolha *Deploy from a branch*, com
branch `main` e pasta `/ (root)`. O site aparece em
`https://USUARIO.github.io/REPOSITORIO/` em alguns minutos.

Para testar localmente antes de subir:

```bash
python -m http.server 8000
```

e abra `http://localhost:8000`.

## Crédito das imagens

O projeto **MUSK** usa fotografia de terceiros, creditada na própria
página:

- **NASA** — domínio público. A NASA não endossa este material.
  - `ISS023E057948` — limbo da atmosfera, Expedição 23
  - `KSC-20250115-PH-FMX02_0001` — lançamento noturno em exposição longa
  - `PIA00407` — Marte, mosaico global (NASA/JPL/USGS)
  - `KSC-20240130-PH-KLS01_0111` — descida do primeiro estágio (NASA/Kim Shiflett)
- **Maarten Van Aerde / Tesla Owners Club Belgium** — quatro quadros de
  Amsterdã, 31.01.2014, sob **CC BY 2.0**. Reenquadrados; nenhuma imagem
  foi gerada, retocada ou reencenada.

O projeto **Adrian Vale** é ficção e não usa fotografia alguma.

## Acessibilidade

Ambos respeitam `prefers-reduced-motion: reduce`, desligando todas as
animações e permanecendo legíveis de forma estática, e têm indicador de
foco visível em `:focus-visible`.
