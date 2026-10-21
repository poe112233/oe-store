# OE 商品 API（对外接口）

通过 HTTPS 直接读写官网商品数据，不用登录后台。每人一把密钥，随时可停用。

> 2026-10-21 起数据落在 Cloudflare D1，接口地址是 `https://ores.cc/api/rpc`。
> 旧的 `oe-brand.app.workbuddy.host`（腾讯云 CloudBase）已停用。

---

## 一、凭据

| 名称 | 用途 | 是否保密 |
| --- | --- | --- |
| `p_key`（密钥） | 识别调用者身份，**每人一把** | 保密，只发给信任的人 |

密钥在后台 **API 密钥** 页点「生成密钥」得到，形如 `oe_` + 48 位十六进制。
列表里只显示前 10 位和后 4 位（中间打码），**生成时复制走**，之后服务端只存哈希，看不到了。

## 二、调用方式

所有接口都是 **POST**，地址统一为：

```
https://ores.cc/api/rpc
```

请求头只用一个：

```
Content-Type: application/json
```

请求体是 JSON，**函数名和参数包在 `fn` / `args` 里，密钥放在 `args.p_key`**：

```json
{ "fn": "oe_api_products", "args": { "p_key": "<你的密钥>", "p_limit": 5 } }
```

成功返回 `{"data": ...}`；出错返回 4xx + `{"error":{"code":"...","message":"..."}}`。

| 操作 | 函数 | 参数 |
| --- | --- | --- |
| 读取商品列表 | `oe_api_products` | `p_key`, `p_limit`(≤1000，默认 200), `p_offset` |
| 读取分类列表 | `oe_api_categories` | `p_key` |
| 新增 / 修改商品 | `oe_api_product_save` | `p_key`, `p_data` |
| 删除商品 | `oe_api_product_delete` | `p_key`, `p_id` |

## 三、例子

### 读取商品（curl）

```bash
curl -s -X POST "https://ores.cc/api/rpc" \
  -H "Content-Type: application/json" \
  -d '{"fn":"oe_api_products","args":{"p_key":"<你的密钥>","p_limit":5}}'
```

返回（截断）：

```json
{
  "data": [
    {
      "id": 5,
      "category_id": 4,
      "name_en": "ASICS Gel-Nimbus 10.1",
      "name_zh": "as gn 10.1",
      "images": ["https://ores.cc/oe/7844348965-90072618.webp"],
      "links": {
        "oopbuy": "https://oopbuy.com/product/weidian/7844348965?inviteCode=TYZZSCDV0",
        "kakobuy": "https://kakobuy.com/item/details?url=https%3A%2F%2Fweidian.com%2Fitem.html%3FitemID%3D7844348965",
        "uidbuy": "https://www.uidbuy.com/product/3/7844348965",
        "hipobuy": "https://hipobuy.com/product/weidian/7844348965",
        "litbuy": "https://litbuy.com/product/weidian/7844348965?linkSearch=true",
        "boonbuy": "https://boonbuy.com/product/weidian/7844348965"
      },
      "sort_order": 1,
      "is_visible": true,
      "clicks": 0,
      "sold_count": 300
    }
  ]
}
```

### 修改一个商品（按官网 id）

```bash
curl -s -X POST "https://ores.cc/api/rpc" \
  -H "Content-Type: application/json" \
  -d '{"fn":"oe_api_product_save","args":{"p_key":"<你的密钥>","p_data":{"id":5,"sold_count":350}}}'
```

### 新增一个商品

```bash
curl -s -X POST "https://ores.cc/api/rpc" \
  -H "Content-Type: application/json" \
  -d '{
    "fn": "oe_api_product_save",
    "args": {
      "p_key": "<你的密钥>",
      "p_data": {
        "category_id": 1,
        "name_en": "New Product",
        "name_zh": "新商品",
        "images": ["https://ores.cc/oe/7844423713-a9f71113.webp"],
        "links": {
          "oopbuy": "https://oopbuy.com/product/weidian/7844423713?inviteCode=TYZZSCDV0",
          "kakobuy": "https://kakobuy.com/item/details?url=https%3A%2F%2Fweidian.com%2Fitem.html%3FitemID%3D7844423713"
        },
        "sort_order": 99,
        "is_visible": true,
        "sold_count": 100
      }
    }
  }'
```

### 删除

```bash
curl -s -X POST "https://ores.cc/api/rpc" \
  -H "Content-Type: application/json" \
  -d '{"fn":"oe_api_product_delete","args":{"p_key":"<你的密钥>","p_id":5}}'
```

### Python（requests）

```python
import requests

KEY = "<你的密钥>"

def rpc(fn, **args):
    r = requests.post("https://ores.cc/api/rpc",
                      json={"fn": fn, "args": {"p_key": KEY, **args}}, timeout=30)
    r.raise_for_status()
    body = r.json()
    if "error" in body:
        raise RuntimeError(body["error"])
    return body["data"]

products = rpc("oe_api_products", p_limit=10)
rpc("oe_api_product_save", p_data={"id": 5, "sold_count": 350})
```

## 四、`p_data` 可用字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | 官网商品 ID。**带 `id` = 修改**，不带 = 新建 |
| `category_id` | number | 分类 ID，见 `oe_api_categories` |
| `name_en` | string | 英文名（新建时必填） |
| `name_zh` | string | 中文名 |
| `images` | string[] | 图片 URL 数组，第一张是主图。图片要先放到 `https://ores.cc/oe/` 下 |
| `links` | object | 购买链接：`oopbuy` / `kakobuy` / `uidbuy` / `hipobuy` / `litbuy` / `boonbuy` |
| `sort_order` | number | 分类内排序，越小越靠前 |
| `is_visible` | boolean | 是否在官网展示 |
| `sold_count` | number | 主图上「已售 N+」徽标的数字，纯展示 |

规则：

- **只改你传过来的字段**，没传的保持原样。
- 新建时 `name_en` 必填，`category_id` 建议给。
- 微店商品 ID 不是字段，但能从 `links.oopbuy` 的 `/weidian/<id>` 里取。
- 商品图 URL 请用 `https://ores.cc/oe/<itemId>-<hash>.webp`（自托管图床，同域直出；不要再用 GitHub/jsDelivr）。

## 五、错误

| 返回 | 含义 |
| --- | --- |
| `{"error":{"code":"INVALID_API_KEY"}}` | 密钥错、已停用或已删除 |
| `{"error":{"code":"BAD_ID"}}` | `p_id` 缺失或不是数字 |
| `{"error":{"code":"NAME_EN_REQUIRED"}}` | 新建商品时没给 `name_en` |
| `{"error":{"code":"BAD_TABLE"}}` | 调用了不存在的表（接口只开放商品/分类） |
| `{"error":{"code":"SERVER_ERROR"}}` | 服务端异常，稍后重试 |

## 六、安全与运维

- 密钥只能读写**商品**、读**分类**，碰不到站点文案、管理员账号、图床令牌。
- 后台 **API 密钥** 页可看「最近使用时间 / 调用次数」，泄露时点 **停用** 立即失效。
- 密钥只存 sha256 哈希；丢了重新生成一把。
- 调用会计入 D1 的每日额度（免费档 500 万行读 / 10 万行写），正常脚本用不完。
