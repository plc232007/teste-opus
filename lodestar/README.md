# Lodestar L-1

Página de produto de um veículo de lançamento fictício, em HTML, CSS e JavaScript.
Faz parte do mesmo universo do experimento `/vale/`: a Lodestar é uma das empresas
de Adrian Vale.

Todo o material 3D é **gerado em código no navegador**. Não há arquivo `.blend`,
`.glb`, textura ou render pré-fabricado neste diretório — só os três arquivos abaixo.

## O que há aqui

| Arquivo | Papel |
| --- | --- |
| `index.html` | Conteúdo: hero, vista explodida, visualizador, ficha técnica, perfil de missão |
| `style.css` | Direção de arte: âmbar sobre quase-preto, grade de engenharia, estados de foco |
| `app.js` | O veículo: geometria, pintura da pele, shader PBR e as três cenas |

## Como os assets são gerados

Não há etapa de build. Tudo acontece no carregamento da página, em `app.js`:

1. **Geometria** (`buildVehicle`) — perfis revolucionados (`revolve`) e caixas (`box`)
   montam casco, interestágio, segundo estágio, carenagem em duas metades, carga com
   painéis articulados, nove sinos de motor, quatro aletas de grade, quatro pernas,
   mais plataforma e torre de serviço. São 6.892 triângulos no total (3.348 só no
   primeiro estágio), construídos em ~8 ms.
2. **Pele** (`paintSkin`) — uma textura 1024×1024 pintada em Canvas2D: metal escovado,
   cordões de solda, rebites, chapas, escotilhas, fuligem na base e o decalque
   "LODESTAR" na tipografia Archivo da própria página (~27 ms). A textura é repintada
   quando as fontes terminam de carregar.
3. **Render** — um único programa WebGL1 (GGX + luz chave âmbar, preenchimento frio,
   ambiente hemisférico, tonemap ACES) desenha as três cenas em contextos separados.

### Detalhe que importa se você for mexer na textura

A pele cobre 17 m de circunferência em `u` e 73 m de fuselagem em `v`: cada texel é
**4,31× mais alto do que largo**. Tudo que precisa parecer redondo ou tipográfico é
desenhado achatado por esse fator (`STRETCH` / `SQUASH` em `paintSkin`). Sem isso o
decalque sai esticado na vertical. A textura sobe com `UNPACK_FLIP_Y`, então o topo do
canvas já é o topo do foguete — não aplique outro flip.

## Abrir

Abra `index.html` direto, ou sirva a pasta `teste-opus`:

```sh
python3 -m http.server 8099
```

e visite `http://localhost:8099/lodestar/`.

## Acessibilidade e desempenho

- `prefers-reduced-motion`: a vista explodida deixa de seguir o scroll e vira quatro
  quadros estáticos escolhidos por botões, com todos os rótulos visíveis ao mesmo
  tempo; o visualizador não gira sozinho.
- O visualizador é operável por teclado: `←` `→` orbitam, `↑` `↓` mudam a elevação,
  `+` `−` aproximam, `R` restaura. `Shift` dá passos grossos.
- Sem WebGL, cada cena troca o canvas por uma elevação técnica em SVG.
- O render é suspenso quando o canvas sai de vista ou a aba fica oculta, e só redesenha
  quando algo muda. Resolução limitada a 1,75× o DPR.
- Peso inicial medido: 81 KB de HTML, CSS e JS sem compressão (20,0 + 19,7 + 41,6),
  mais 158 KB de fontes do Google Fonts — 240 KB no total. Nenhuma imagem é baixada.

Veículo, empresa, motores e histórico de voo são ficção.
