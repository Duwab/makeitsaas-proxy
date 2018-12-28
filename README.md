# Proxy
(Make it Saas)

Simple proxy service, with livereload

## Getting started

```
cp .env.dist .env
npm install
npm start
```

Put routing config `config/routes` (view `config/routes/example.yml`)

## Livereload

```
touch config/reload/example
```

After a short interval, `config/routes/example.yml` will be reloaded,
then `config/reload/example` will be deleted
