# 家家点餐咯 · 中餐厅点餐网站

纯静态网站（GitHub Pages），数据用 Supabase（免费）。

- 线上地址：https://wanan99999.github.io/diancan-order/
- 标题字体预览：https://wanan99999.github.io/diancan-order/fonts.html

## 两种运行模式

| 模式 | 条件 | 说明 |
|---|---|---|
| 本地演示 | `js/config.js` 里 Supabase 两项留空 | 数据只存在当前浏览器；演示管理员 admin / 123456 |
| 云端 | 填好 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY` | 多设备共享账号、菜单、订单、图片 |

## 开通云端（约 5 分钟）

1. 打开 https://supabase.com 用 GitHub 登录 → New project（Region 选 Singapore 或 Tokyo，国内较快）。
2. 左侧 **SQL Editor** → New query → 粘贴 `supabase/schema.sql` 全部内容 → Run。
3. 左侧 **Authentication → Sign In / Providers → Email**：关闭 **Confirm email**（账号用用户名注册，不发验证邮件）。
4. **Project Settings → API**：复制 Project URL 和 anon public key，填进 `js/config.js`。
5. 在网站上注册你的管理员账号，记下"我的"页面里的 ID，然后在 SQL Editor 运行：
   `update public.profiles set is_admin = true where uid = 你的ID;`

## 可调设置（`js/config.js`）

- `BRAND_FONT`：标题字体 `kuaile | mashanzheng | zhimangxing | huangyou | longcang`
- `CART_STYLE`：`float`（右下角悬浮按钮）或 `bar`（底部结算栏）
- 预览时可直接在网址后加 `?font=longcang&cart=bar`

## 文件

- `index.html` / `css/style.css` / `js/app.js`：页面与交互
- `js/backend.js`：数据层（本地 / Supabase 两套实现）
- `js/seed.js`：分类与初始菜品
- `supabase/schema.sql`：建表、权限（RLS）、图片存储、初始菜品
- `fonts/`：标题字体子集（只含标题用到的字，几 KB，国内可访问）
