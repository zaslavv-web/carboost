## Проблема
В workflow `.github/workflows/deploy-frontend.yml` используется несуществующая версия экшена:
```yaml
uses: webfactory/ssh-agent@v0.10.1
```
GitHub Actions не может её разрешить, и деплой падает до этапа rsync.

## План исправления

1. **Исправить версию экшена**  
   Заменить `webfactory/ssh-agent@v0.10.1` на актуальную стабильную версию — `webfactory/ssh-agent@v0.9.0`.

2. **Добавить проверку наличия секрета**  
   Добавить шаг перед `Setup SSH`, который явно проверяет, что `secrets.DEPLOY_SSH_KEY` не пустой. Это даст понятную ошибку раньше, чем rsync/ssh-agent упадёт с пустым ключом.

3. **Зафиксировать и протестировать**  
   После правки запустить workflow вручную через **Actions → Deploy Frontend → Run workflow** и убедиться, что шаг `Setup SSH` проходит без ошибок разрешения экшена.

## Технические детали
- Файл для изменения: `.github/workflows/deploy-frontend.yml`, строка 52.
- Проверка секрета:
  ```yaml
  - name: Check SSH secret
    run: |
      if [ -z "${{ secrets.DEPLOY_SSH_KEY }}" ]; then
        echo "::error::DEPLOY_SSH_KEY is not set"
        exit 1
      fi
  ```

После применения этих правок деплой должен дойти до этапа rsync.