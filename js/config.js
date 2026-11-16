// 站点配置
// SUPABASE_URL / SUPABASE_ANON_KEY 留空 => 本地演示模式（数据只存在当前浏览器）
// 填写后 => 云端模式（多设备共享账号、菜单、订单）
// anon key 是公开密钥，可以放在前端；权限由数据库 RLS 策略保证。
window.APP_CONFIG = {
  SUPABASE_URL: 'https://dpedzxxbabfwhwvvirzy.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_qRcTimFxnKweNkag_ywjYw_mRXycoTv',
  // 用户名登录会映射成这个域名下的邮箱（Supabase 需要邮箱格式），用户看不到
  EMAIL_DOMAIN: 'diancan.app',

  // 标题字体：kuaile | mashanzheng | zhimangxing | huangyou | longcang
  // 可用网址参数 ?font=xxx 临时预览
  BRAND_FONT: 'kuaile',
  // 标题背景：0=原版红色渐变 1-7=候选样式，可用 ?bg=3 临时预览
  BRAND_BG: '1',
  // 购物车样式：float（右下角两个悬浮按钮）| bar（底部结算栏）
  // 可用网址参数 ?cart=bar 临时预览
  CART_STYLE: 'bar',
  // 界面版本：1=两列卡片（旧版） 2=单列列表（当前），可用 ?ui=1 查看旧版
  UI: '2',
};
