# Elon Musk - Astra 6

Experiência independente em português, criada em HTML, CSS e JavaScript, com:

- Planeta procedural em WebGL: relevo, iluminação e atmosfera calculados por shader.
- Laboratório com três paletas de planetas, rotação por mouse/toque/setas, velocidade, pausa, malha e restauração.
- Explorador de seis empresas com abas acessíveis por teclado.
- Fotografias locais, linha do tempo expansível e modal de créditos.
- Layout responsivo e respeito a `prefers-reduced-motion`, inclusive se a preferência mudar durante a visita.
- Renderização suspensa quando o canvas sai de vista ou a aba fica oculta; resolução limitada a 1,5×.
- Alternativa visual quando WebGL não está disponível.

## Abrir

Abra `index.html` diretamente, ou execute na pasta `teste-opus`:

```sh
python3 -m http.server 8086
```

Visite `http://localhost:8086/astra-6/`. O índice geral está em `http://localhost:8086/`.

Não há instalação nem build. As fontes do Google Fonts são opcionais e possuem alternativas locais. As fotografias reutilizam os arquivos em `../musk/img/`; mantenha essa pasta ao distribuir o site. Os créditos e a licença dos retratos aparecem no rodapé, em “Créditos & informações”. Os planetas são interpretações artísticas, não simulações científicas.
