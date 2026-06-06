"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface User {
  id?: string;
  username: string;
  email?: string;
  name: string;
  phone?: string;
  role: "ADMIN" | "MANAGER" | "CASHIER" | "VIEWER";
  isActive?: boolean;
}

interface AddUserDialogProps {
  user?: User | null;
  onClose: () => void;
  onSuccess: () => void;
}

function useUserForm(
  user: User | null | undefined,
  onClose: () => void,
  onSuccess: () => void,
) {
  const { toast } = useToast();
  const t = useTranslations("Users");
  const tp = useTranslations("PasswordChange");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState<User>({
    username: user?.username || "",
    email: user?.email || "",
    name: user?.name || "",
    phone: user?.phone || "",
    role: user?.role || "CASHIER",
  });
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEditing = !!user?.id;

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.username?.trim()) {
      newErrors.username = t("username_required");
    } else if (formData.username.length < 3) {
      newErrors.username = t("username_min");
    }

    if (!formData.name?.trim()) {
      newErrors.name = t("name_required");
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t("email_invalid");
    }

    if (!isEditing && !password) {
      newErrors.password = t("password_required");
    } else if (password && password.length < 6) {
      newErrors.password = tp("password_min");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      const payload: User & { password?: string } = { ...formData };

      if (password) {
        payload.password = password;
      }

      const url = isEditing ? `/api/users/${user?.id}` : "/api/users";
      const method = isEditing ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || (isEditing ? t("update_failed") : t("add_failed")),
        );
      }

      toast({
        title: t("success"),
        description: isEditing ? t("user_updated") : t("user_added"),
      });

      onSuccess();
      onClose();
    } catch (err) {
      console.error("Error saving user:", err);
      toast({
        title: t("error"),
        description: err instanceof Error ? err.message : (isEditing ? t("update_failed") : t("add_failed")),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    showPassword,
    setShowPassword,
    formData,
    setFormData,
    password,
    setPassword,
    errors,
    isEditing,
    handleSubmit,
  };
}

export function AddUserDialog({
  user,
  onClose,
  onSuccess,
}: AddUserDialogProps) {
  const t = useTranslations("Users");
  const tc = useTranslations("Common");
  const tp = useTranslations("PasswordChange");
  const {
    loading,
    showPassword,
    setShowPassword,
    formData,
    setFormData,
    password,
    setPassword,
    errors,
    isEditing,
    handleSubmit,
  } = useUserForm(user, onClose, onSuccess);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] w-[95vw] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? t("edit_user") : t("add_new_user")}</DialogTitle>
          <DialogDescription>
            {t("enter_user_details")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username">{t("username_label")}</Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) =>
                setFormData({ ...formData, username: e.target.value })
              }
              placeholder={t("enter_username")}
              disabled={loading}
              className={errors.username ? "border-destructive" : ""}
            />
            {errors.username && (
              <p className="text-sm text-destructive">{errors.username}</p>
            )}
          </div>

          {/* Full Name */}
          <div className="space-y-2">
            <Label htmlFor="name">{t("name_label")}</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder={t("enter_name")}
              disabled={loading}
              className={errors.name ? "border-destructive" : ""}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">{t("email_label")}</Label>
            <Input
              id="email"
              type="email"
              value={formData.email || ""}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value || undefined })
              }
              placeholder={t("enter_email")}
              disabled={loading}
              className={errors.email ? "border-destructive" : ""}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email}</p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone">{t("phone_label")}</Label>
            <Input
              id="phone"
              value={formData.phone || ""}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value || undefined })
              }
              placeholder={t("enter_phone")}
              disabled={loading}
            />
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label htmlFor="role">{t("role_label")}</Label>
            <Select
              value={formData.role}
              onValueChange={(value: User["role"]) =>
                setFormData({ ...formData, role: value })
              }
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">{t("role_admin")} - {t("role_admin_desc")}</SelectItem>
                <SelectItem value="MANAGER">
                  {t("role_manager")} - {t("role_manager_desc")}
                </SelectItem>
                <SelectItem value="CASHIER">
                  {t("role_cashier")} - {t("role_cashier_desc")}
                </SelectItem>
                <SelectItem value="VIEWER">
                  {t("role_viewer")} - {t("role_viewer_desc")}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {formData.role === "ADMIN" && t("role_admin_desc")}
              {formData.role === "MANAGER" && t("role_manager_desc")}
              {formData.role === "CASHIER" && t("role_cashier_desc")}
              {formData.role === "VIEWER" && t("role_viewer_desc")}
            </p>
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="password">
              {t("password_label")} {isEditing && `(${t("leave_blank_placeholder")})`}
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  isEditing ? t("enter_new_password_placeholder") : t("enter_password")
                }
                disabled={loading}
                className={errors.password ? "border-destructive" : ""}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password}</p>
            )}
            {!isEditing && (
              <p className="text-xs text-muted-foreground">
                {tp("password_min")}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              {tc("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEditing ? t("update_user") : t("create_user")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default AddUserDialog;
