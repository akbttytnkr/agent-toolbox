---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python セキュリティ

> このファイルは [common/security.md](../common/security.md) を Python 固有の内容で拡張します。

## シークレット管理

```python
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.environ["OPENAI_API_KEY"]  # 未設定の場合 KeyError が発生
```

## セキュリティスキャン

- 静的セキュリティ分析には **bandit** を使用:
  ```bash
  bandit -r src/
  ```

## 参考

スキル: `django-security` で Django 固有のセキュリティガイドラインを参照（該当する場合）。
