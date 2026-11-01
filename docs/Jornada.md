# Jornada do 1 ao 20 (v0.3)

Tudo aqui é **sugestão** (v0.3): reorganiza as etapas de CLAUDE.md e Narrativa.md a pedido do usuário. Os
autores podem trocar nomes, falas e números. Os dados ficam em `packages/shared/data/missions.json`
(níveis e objetivos), `progression.json` (etapas, marcos e capítulos) e `items.json`.

## Fio da história
O jogador sai do Delta, a terra de ninguém na foz, e a cada capítulo chega mais perto da Ponte, sem
nunca atravessá-la. No 19 ele está no pé da Ponte, olhando a outra margem, e percebe que ela parece
igualzinha à dele, só que com outra cor. A Ponte em si, com a Arena, a Noite Escura e o Acordo, fica para
depois do 20.

## Etapas
| Níveis | Etapa | O que acontece |
|---|---|---|
| 1 | Criação | Personagem zoeiro no cadastro do Delta, com a ficha que o Seu Jacó preenche com uma caneta que falha. |
| 1 a 4 | Introdução no Delta | O tutorial em missões: remar, brigar no mangue, os mosquitos, a chopindita barata e a fila do boleto. No 4, o chefe Bruno Ferro, o Capataz, leva o barco do vizinho. |
| 5 | A balsa | O Seu Jacó leva o novato de balsa até o meio do rio. Ali o jogador escolhe a margem, a instituição (que é a classe) e o guia, tem a aula dos botões no convés e desembarca no cais. |
| 5 a 9 | Primeiras missões | Na Esquerda, A Roda (Assembleia, mutirão, posto, a luz da rua). Na Direita, O Primeiro Contrato (ativação, drone de cobrança, bico, desconto em folha). As duas terminam no 9 com a descoberta de que a energia da rua foi desviada. As Galerias da Usina abrem no 7. |
| 10 | Especialização | O jogador escolhe a ala, conhece o treinador e ganha a **arma** da classe, a 1ª peça do conjunto. Também é o 1º talento. |
| 11 a 13 | A mata | Esquerda, A Licença: a Sahl quer uma mina na mata, Teodoro quer negociar e Lazzaro quer guerra, e a comissão está sem quórum. Direita, A Mata Fechada: abrir caminho no Juncal, o Curupira e a escolha entre a empresa e a mata. Peças: **capacete** no 11 e **calçado** no 13. |
| 15 a 17 | O rio e a usina | Esquerda, O Rio Turvo: a água turva na barragem, o relatório nas Galerias e o cabo. Direita, Siga o Dinheiro: o apagão, o custo não previsto e o mesmo cabo. Peça: **adereço** no 16. No 17, os dois lados veem o mesmo cabo subir a Serra. |
| 19 | A cabeceira | O Seu Jacó espera no pé da Ponte. Os homens do Sombra fecharam a cabeceira, e lá de cima dá para ver a outra margem. Peça: **armadura**, a última, que completa o conjunto. A **troca de lado** fica liberada. |
| 20 | Talento-chave | Talento-chave e traje de veterano. A Arena da Ponte vem depois. |

## Conjunto da classe
- São 5 slots: capacete, armadura (a calça vem junto), arma, calçado e adereço.
- Cada peça de classe muda a sua parte do boneco no estilo da ala, como `items.json`,
  `visualPorArquetipo`, já descreve. Por exemplo, o capacete do Peão Brabo é o chapéu de palha.
- Com as 5 peças da classe e da margem, o boneco vira a **versão inicial da ala** e fica parecido com o
  líder dela. A regra é `conjuntoDaClasse(rec)` em `shared/src/game/equipment.ts`.
- As peças vêm das missões, como a recompensa `item` com `slotDaClasse`: 10 arma, 11 capacete,
  13 calçado, 16 adereço e 19 armadura.

## Ritmo do combate
Até o 10, o ataque básico é 1,4x mais lento e 1,4x mais forte, com o mesmo dano por segundo. Do 10 ao 20,
o ritmo volta ao normal aos poucos (`balance.combate.ritmoInicial`). Cada golpe tem animação própria:
preparo, bote na direção do alvo e um achatado no impacto.
