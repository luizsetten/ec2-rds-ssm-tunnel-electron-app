# Chatbot Personalizado com AWS Bedrock
Utilizando AWS Bedrock para Construção de Chat com IA Generativa com Conteúdos Incorporados

### 📋 Pré-requisitos

```
Node v20+
AWS Session Manager Plugin (session-manager-plugin) instalado e no PATH
Profile AWS SSO configurado em ~/.aws/config (sso_start_url / sso_region / sso_account_id / sso_role_name)
```

> O app **não depende mais do AWS CLI**. A abertura do túnel é feita diretamente
> via AWS SDK (chamada `StartSession`) e o `session-manager-plugin` cuida do
> canal WebSocket. O login SSO (`aws sso login`) também foi substituído pelo
> fluxo OIDC *device authorization* embutido no app, que abre o navegador para
> autorização e reutiliza o cache em `~/.aws/sso/cache`.

### 🔧 Instalação

```
npm install
```

### ⚙️ Executando 

Para gerar o build do .exe do app
```
npm electron-builder
```

### 🛠️ Construído com

* [Electron v33](https://www.electronjs.org/blog/electron-33-0)

### Explicação

## Problema
Para conectar a um RDS em subnet privada através de softwares como DBeaver, era necessário:

- Criar uma EC2 em subnet pública como Bastion Host.
- Gerenciar chaves SSH para autenticação.
- Criar um túnel SSH manual no terminal ligando o RDS à EC2 e ao usuário.

Essa abordagem aumenta a complexidade operacional e expõe riscos de segurança.

Solução
Para melhorar a segurança e eliminar o uso de chaves SSH, a EC2 foi movida para uma subnet privada, substituindo a conexão SSH pelo uso do AWS Session Manager.

O app Electron foi criado para automatizar a abertura de conexões no terminal entre a EC2, o RDS e o usuário, permitindo que todo o processo seja feito com poucos cliques.

## Previews

![Diagrama do projeto](assets/app-conexoes.png)
![Diagrama do projeto](assets/app-nova-conexoes.png)