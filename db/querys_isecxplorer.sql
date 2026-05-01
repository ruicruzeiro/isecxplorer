create table quiz (
id SERIAL PRIMARY KEY,
poi VARCHAR(50) NOT NULL,
pergunta VARCHAR(250) NOT NULL,
opcao_a VARCHAR(250) NOT NULL,
opcao_b VARCHAR(250) NOT NULL,
opcao_c VARCHAR(250) NOT NULL,
opcao_d VARCHAR(250) NOT NULL,
opcao_certa CHAR(1) NOT NULL CHECK (opcao_certa IN ('A', 'B', 'C', 'D'))
);

insert into quiz (poi, pergunta, opcao_a, opcao_b, opcao_c, opcao_d, opcao_certa)
values
('gerais', 'Qual dos seguintes serviços NÃO está neste edifício?', 'Secção de Textos', 'Armazém', 'Churrasqueira Académica', 'Laboratório de Física', 'C'),
('polivalente', 'Pergunta placeholder sobre polivalente?', 'Opção A', 'Opção B', 'Opção C', 'Opção D', 'D'),
('auditorio', 'Pergunta placeholder sobre auditorio?', 'Opção A', 'Opção B', 'Opção C', 'Opção D', 'D'),
('dec', 'Pergunta placeholder sobre dec?', 'Opção A', 'Opção B', 'Opção C', 'Opção D', 'B'),
('altice', 'Pergunta placeholder sobre altice?', 'Opção A', 'Opção B', 'Opção C', 'Opção D', 'A'),
('dem', 'Pergunta placeholder sobre dem?', 'Opção A', 'Opção B', 'Opção C', 'Opção D', 'A'),
('dee', 'Pergunta placeholder sobre dee?', 'Opção A', 'Opção B', 'Opção C', 'Opção D', 'A'),
('gab_electro', 'Pergunta placeholder sobre gab_electro?', 'Opção A', 'Opção B', 'Opção C', 'Opção D', 'B'),
('deem', 'Pergunta placeholder sobre deem?', 'Opção A', 'Opção B', 'Opção C', 'Opção D', 'C'),
('lab_mecanica', 'Pergunta placeholder sobre lab_mecanica?', 'Opção A', 'Opção B', 'Opção C', 'Opção D', 'D'),
('lab_civil', 'Quais são os dois laboratórios de Eng. Civil?', 'Solos e Estruturas', 'Estruturas e Pavimentos', 'Hidráulica e Construção', 'Aço e Betão', 'B'),
('horta', 'De que marca é o tractor?', 'Kubota', 'New Holland', 'John Deere', 'Fiatagri', 'A'),
('carregador', 'Pergunta placeholder sobre carregador?', 'Opção A', 'Opção B', 'Opção C', 'Opção D', 'D'),
('deis', 'Pergunta placeholder sobre deis?', 'Opção A', 'Opção B', 'Opção C', 'Opção D', 'C'),
('cantina', 'Qual o horário de funcionamento da cantina?', 'Opção A', 'Opção B', 'Opção C', 'Opção D', 'A'),
('clinica', 'Pergunta placeholder sobre clinica?', 'Opção A', 'Opção B', 'Opção C', 'Opção D', 'C'),
('reprografia', 'Pergunta placeholder sobre reprografia?', 'Opção A', 'Opção B', 'Opção C', 'Opção D', 'B'),
('aeisec', 'Pergunta placeholder sobre aeisec?', 'Opção A', 'Opção B', 'Opção C', 'Opção D', 'D'),
('festas', 'Pergunta placeholder sobre festas?', 'Opção A', 'Opção B', 'Opção C', 'Opção D', 'C'),
('deqb', 'Pergunta placeholder sobre deqb?', 'Opção A', 'Opção B', 'Opção C', 'Opção D', 'A'),
('bar_loja', 'Que artigos não estão à venda na loja?', 'Canetas', 'Legos', 'Hoodies', 'T-shirts', 'B');

TRUNCATE TABLE quiz RESTART IDENTITY;