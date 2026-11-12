import { Select, Label, ListBox } from "@heroui/react";
export function UserLookupMode() {
  return (
    <Select
      name="identityKind"
      defaultSelectedKey="username"
      aria-label="账号查询方式"
    >
      <Label>查询方式</Label>
      <Select.Trigger>
        <Select.Value />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id="username" textValue="用户名">
            用户名
          </ListBox.Item>
          <ListBox.Item id="publicId" textValue="公共 ID">
            公共 ID
          </ListBox.Item>
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
