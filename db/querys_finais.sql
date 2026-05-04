CREATE TABLE quiz (
id SERIAL PRIMARY KEY,
poi VARCHAR(50) NOT NULL,
pergunta VARCHAR(250) NOT NULL,
opcao_a VARCHAR(250) NOT NULL,
opcao_b VARCHAR(250) NOT NULL,
opcao_c VARCHAR(250) NOT NULL,
opcao_d VARCHAR(250) NOT NULL,
resposta_certa VARCHAR(250) NOT NULL
);

INSERT INTO quiz (poi, pergunta, opcao_a, opcao_b, opcao_c, opcao_d, opcao_certa)
VALUES
('gerais', 'Qual dos seguintes serviços NÃO está neste edifício?', 'Secção de Textos', 'Armazém', 'Cantina', 'Laboratório de Física', 'Cantina'),
('polivalente', 'Que dispositivo médico está disponível no átrio?', 'Kit de Primeiros Socorros', 'Assador de Chouriças', 'Medidor de Tensão', 'Desfibrilhador', 'Desfibrilhador'),
('auditorio', 'Em que ano se comemourou o centenário do ISEC?', '2021', '2002', '2018', '2012', '2021'),
('dec', 'Quantos anfiteatros há no DEC?', '0', '1', '2', '3', '1'),
('altice', 'Qual o slogan da Altice Labs?', 'Building the Future', 'Beyond the Future', 'Back to the Future', 'Boosting the Future', 'Building the Future'),
('dem', 'Qual o modelo da máquina que está no átrio?', 'IMPEC 51', 'IMAC 51', 'ISEC 15S', 'IMEC 15', 'IMEC 15'),
('dee', 'Quantos transformadores de corrente há à porta do DEM?', '4', '5', '6', '0', '5'),
('gab_electro', 'Quem não está disponível para assuntos deste gabinete?', 'Eng.ª Sónia Branco', 'Sr. Francisco Dias', 'Eng. Francisco Queirós', 'Eng. Paulo Queiró', 'Eng. Francisco Queirós'),
('deem', 'Quantas manivelas há ao todo nas máquinas no átrio?', '5', '6', '8', '9', '5'),
('lab_mecanica', 'Que laboratório não faz parte deste edifício?', 'Lab. Climatização', 'Lab. Sistemas Técnicos', 'Lab. Óleos e Lubrificantes', 'Lab. Tecnologia Oficinal', 'Lab. Óleos e Lubrificantes'),
('lab_civil', 'Quais os laboratórios deste edifício?', 'Estruturas e Hidráulica Fluvial', 'Mecânica dos Solos e Pavimentos Rodoviários', 'Estruturas e Mecânica dos Solos', 'Estruturas e Pavimentos Rodoviários', 'Estruturas e Pavimentos Rodoviários'),
('horta', 'Qual a bebida preferida do espantalho?', 'Cerveja', 'Licor Beirão', 'Vinho', 'Água das Pedras', 'Licor Beirão'),
('carregador', 'Qual a potência do carregador?', '22 kVA', '20 kVA', '32 kVA', '19 kVA', '22 kVA'),
('deis', 'Que equipamento do DEIS está aberto a todos os cursos?', 'Biblioteca', 'Sala de Convívio', 'Sala de Estudo', 'Assador de Chouriças', 'Biblioteca'),
('cantina', 'Qual o horário de funcionamento da Cantina nos dias úteis?', '12:00-14:30 e 19:00-21:30', '12:30-14:30 e 19:00-21:30', '12:15-14:30 e 19:00-21:55', '12:00-13:30 e 19:30-20:30', '12:00-14:30 e 19:00-21:30'),
('clinica', 'Qual destas consultas podes encontrar na Clínica IPC?', 'Psicologia', 'Ortopedia', 'Medicina Dentária', 'Aromaterapia', 'Psicologia'),
('reprografia', 'Quem fabricou o letreiro da Reprografia?', 'Mega Imagem', 'Meta Imagem', 'Mega Miragem', 'Mega Viagem', 'Mega Imagem'),
('aeisec', 'Qual o horário da sala de estudo de informática?', '9:00-18:00', '9:00-19:00', '8:00-18:00', '9:00-17:00', '9:00-18:00'),
('festas', 'Qual a marca de cerveja que se bebe aqui?', 'Sagres', 'Super Bock', 'Cergal', 'Cristal', 'Sagres'),
('deqb', 'Qual o número atómico do Lítio?', '10', '3', '8', '15', '3'),
('bar_loja', 'Que artigo não se vende na loja?', 'Assador de Chouriças', 'Garrafas de Água', 'Sweatshirts', 'T-shirts', 'Assador de Chouriças');