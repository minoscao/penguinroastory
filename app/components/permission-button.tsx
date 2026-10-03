'use client';
import { Button as BaseButton } from '@/components/ui/button';
import { useAuth } from '@/components/auth-provider';
import type { Permission } from '@/lib/permissions';
import type { ComponentProps } from 'react';
export function PermissionButton({
  permission,
  ...props
}: ComponentProps<typeof BaseButton> & {
  permission?: Permission | Permission[];
}) {
  const { can } = useAuth();
  const denied =
    permission &&
    !(Array.isArray(permission) ? permission.some(can) : can(permission));
  return (
    <BaseButton
      {...props}
      disabled={props.disabled || !!denied}
      title={denied ? '此操作未授权，请联系管理员' : props.title}
    />
  );
}
