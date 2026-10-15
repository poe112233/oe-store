# OE 商品 API（对外接口）

通过 HTTPS 直接读写官网商品数据，不需要登录后台。每人一把密钥，可随时停用。

---

## 一、两个凭据

| 名称 | 用途 | 是否保密 |
| --- | --- | --- |
| `x-wb-webapp-access-key` | 识别这是本站的应用（**所有调用都要带**） | 公开，前端代码里就有 |
| `p_key`（密钥） | 识别调用者身份（**每人一把**） | 保密，只发给你信任的人 |

- 应用 Key：`wbpk_LBkK4tO5FUutWDujrDXhyb_jYM6R3tvM50Zst8HehG43terKRDr3fET`
- 个人密钥：在后台 **API 密钥** 页点「生成密钥」得到，形如 `oe_` + 48 位十六进制；**只显示一次**，之后服务端只留哈希。

## 二、调用方式

所有接口都是 **POST**，地址统一为：

```
https://oe-brand.app.workbuddy.host/.cloud/database/rest/rpc/<函数名>
```

请求头：

```
Content-Type: application/json
x-wb-webapp-access-key: <应用 Key>
```

请求体是 JSON，**密钥放在 `p_key` 字段里**（不能放请求头 —— 网关不透传自定义头）。

| 操作 | 函数 | 请求体 |
| --- | --- | --- |
| 读取商品列表 | `oe_api_products` | `{"p_key":"...","p_limit":500,"p_offset":0}` |
| 新增 / 修改商品 | `oe_api_product_save` | `{"p_key":"...","p_data":{...}}` |
| 删除商品 | `oe_api_product_delete` | `{"p_key":"...","p_id":123}` |
| 读取分类列表 | `oe_api_categories` | `{"p_key":"..."}` |

## 三、例子

### 读取商品（curl）

```bash
curl -s -X POST "https://oe-brand.app.workbuddy.host/.cloud/database/rest/rpc/oe_api_products" \
  -H "Content-Type: application/json" \
  -H "x-wb-webapp-access-key: wbpk_LBkK4tO5FUutWDujrDXhyb_jYM6R3tvM50Zst8HehG43terKRDr3fET" \
  -d '{"p_key":"<你的密钥>","p_limit":5}'
```

返回（截断）：

```json
[
  {
    "id": 2,
    "category_id": 5,
    "category": "YEEZY",
    "item_id": "7844423713",
    "name_en": "Yeezy Slide",
    "name_zh": "Y S 拖鞋 系列",
    "images": ["https://cdn.jsdelivr.net/gh/poe112233/oe-gallery@main/products/202610/7844423713-a9f71113.jpg"],
    "links": { "oopbuy": "https://oopbuy.com/product/weidian/7844423713?inviteCode=TYZZSCDV0", "...": "..." },
    "sort_order": 1,
    "is_visible": true,
    "sold_count": 200
  }
]
```

### 修改一个商品（按微店 item_id 定位）

```bash
curl -s -X POST "https://oe-brand.app.workbuddy.host/.cloud/database/rest/rpc/oe_api_product_save" \
  -H "Content-Type: application/json" \
  -H "x-wb-webapp-access-key: wbpk_LBkK4tO5FUutWDujrDXhyb_jYM6R3tvM50Zst8HehG43terKRDr3fET" \
  -d '{"p_key":"<你的密钥>","p_data":{"item_id":"7844423713","name_en":"Yeezy Slide Onyx","sold_count":300}}'
```

### 新增一个商品

```json
{
  "p_key": "<你的密钥>",
  "p_data": {
    "name_en": "New Product",
    "name_zh": "新商品",
    "category_id": 1,
    "images": ["https://cdn.jsdelivr.net/gh/poe112233/oe-gallery@main/products/202610/xxxx.jpg"],
    "links": { "oopbuy": "https://oopbuy.com/product/weidian/1234567890?inviteCode=TYZZSCDV0" },
    "sort_order": 99,
    "sold_count": 100
  }
}
```

### Python（requests）

```python
import requests

BASE = "https://oe-brand.app.workbuddy.host/.cloud/database/rest/rpc"
HEAD = {
    "Content-Type": "application/json",
    "x-wb-webapp-access-key": "wbpk_LBkK4tO5FUutWDujrDXhyb_jYM6R3tvM50Zst8HehG43terKRDr3fET",
}
KEY = "<你的密钥>"

def rpc(fn, **payload):
    r = requests.post(f"{BASE}/{fn}", json={"p_key": KEY, **payload}, headers=HEAD, timeout=30)
    r.raise_for_status()
    return r.json()

products = rpc("oe_api_products", p_limit=10)
rpc("oe_api_product_save", p_data={"item_id": "7844423713", "sold_count": 350})
```

## 四、`p_data` 可用字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | number | 官网商品 ID（与 `item_id` 二选一，用来定位要改的商品） |
| `item_id` | string | **微店商品 ID**，从商品图文件名里提取，例如 `7844423713` |
| `category_id` | number | 分类 ID，见 `oe_api_categories` |
| `name_en` | string | 英文名（新建时必填） |
| `name_zh` | string | 中文名 |
| `images` | string[] | 图片 URL 数组，第一张是主图 |
| `links` | object | 购买链接：`oopbuy` / `kakobuy` / `uidbuy` / `hipobuy` / `litbuy` / `boonbuy` |
| `sort_order` | number | 分类内排序，越小越靠前 |
| `is_visible` | boolean | 是否在官网展示 |
| `sold_count` | number | 主图上「已售 N+」徽标的数字，纯展示 |

规则：

- **带 `id` 或 `item_id` = 修改**，两个都不带 = 新建。
- **只改你传过来的字段**，没传的保持原样（`name_zh` 传空字符串可以清空）。
- 新建时 `name_en` 必填。

## 五、错误

出错时返回 4xx + JSON：

| 返回 | 含义 |
| --- | --- |
| `{"code":"DATABASE_P0001","message":"invalid_api_key"}` | 密钥错、已停用或已删除 |
| `{"message":"product_not_found"}` | `id`/`item_id`/`p_id` 找不到对应商品 |
| `{"message":"name_en_required"}` | 新建时没给 `name_en` |
| `401 invalid_client` | 漏了 `x-wb-webapp-access-key` 请求头 |

## 六、安全与运维

- 密钥只能操作**商品**和**读取分类**，碰不到站点文案、图床令牌、管理员账号。
- 后台 **API 密钥** 页可看每个人的「最近使用时间 / 调用次数」，离职或泄露时点 **停用** 立即失效。
- 密钥只存 sha256 哈希，明文不落库；丢了只能重新生成一把。
- 网页端不经过这些接口，改密钥不会影响官网正常访问。
