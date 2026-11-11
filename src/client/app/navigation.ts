import type { IconName } from "../components/Icon";
interface NavigationItem {
  id: string;
  label: string;
  symbol: IconName;
}
export const userNavigation: NavigationItem[] = [
  {
    id: "conversations",
    label: "聊天",
    symbol: "chat",
  },
  {
    id: "contacts",
    label: "联系人",
    symbol: "people",
  },
  {
    id: "saved",
    label: "私人收藏",
    symbol: "bookmark",
  },
  {
    id: "devices",
    label: "设备",
    symbol: "device",
  },
  {
    id: "recovery",
    label: "密钥与恢复",
    symbol: "key",
  },
  {
    id: "trash",
    label: "消息回收站",
    symbol: "archive",
  },
  {
    id: "data",
    label: "数据与备份",
    symbol: "archive",
  },
  {
    id: "settings",
    label: "设置",
    symbol: "settings",
  },
  {
    id: "privacy",
    label: "隐私",
    symbol: "shield",
  },
];
export const adminNavigation: NavigationItem[] = [
  {
    id: "admin",
    label: "概览",
    symbol: "grid",
  },
  {
    id: "admin/users",
    label: "用户管理",
    symbol: "people",
  },
  {
    id: "admin/devices",
    label: "设备管理",
    symbol: "device",
  },
  {
    id: "admin/logins",
    label: "登录记录",
    symbol: "list",
  },
  {
    id: "admin/analytics",
    label: "网站分析",
    symbol: "chart",
  },
  {
    id: "admin/regions",
    label: "地区分布",
    symbol: "globe",
  },
  {
    id: "admin/security",
    label: "安全中心",
    symbol: "shield",
  },
  {
    id: "admin/registration",
    label: "注册与邀请",
    symbol: "key",
  },
  {
    id: "admin/backups",
    label: "备份管理",
    symbol: "archive",
  },
  {
    id: "admin/audit",
    label: "操作审计",
    symbol: "list",
  },
  {
    id: "admin/settings",
    label: "系统设置",
    symbol: "settings",
  },
];
export function pageTitle(page: string): string {
  return (
    [...userNavigation, ...adminNavigation].find((item) => item.id === page)
      ?.label ?? "页面不存在"
  );
}
