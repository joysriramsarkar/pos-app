"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Trash2,
  Edit,
  Plus,
  Check,
  X,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIsAdmin } from "@/hooks/use-permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslations } from "next-intl";

// Import AddUserDialog as lazy component to avoid module resolution issues
const AddUserDialog = React.lazy(() =>
  import("./AddUserDialog").then((mod) => ({ default: mod.AddUserDialog }))
);

import { Badge } from "@/components/ui/badge";

export interface User {
  id: string;
  username: string;
  email?: string;
  name: string;
  phone?: string;
  role: "ADMIN" | "MANAGER" | "CASHIER" | "VIEWER";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UsersManagementProps {
  currentUserRole?: string;
}

export function UsersManagement({ currentUserRole }: UsersManagementProps) {
  const t = useTranslations("Users");
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const { toast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/users");

      if (!response.ok) {
        if (response.status === 403) {
          setError(t("no_permission"));
          return;
        }
        throw new Error(t("error"));
      }

      const data = await response.json();
      setUsers(Array.isArray(data) ? data : (data.data ?? []));
    } catch (err) {
      console.error("Error fetching users:", err);
      setError(t("error"));
      toast({ title: t("error"), description: t("error"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      setDeleting(true);
      const response = await fetch(`/api/users/${deleteConfirm.id}`, { method: "DELETE" });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || t("error"));
      }
      setUsers(users.filter((u) => u.id !== deleteConfirm.id));
      toast({ title: t("success"), description: t("deleted_successfully") });
      setDeleteConfirm(null);
    } catch (err) {
      console.error("Error deleting user:", err);
      toast({
        title: t("error"),
        description: err instanceof Error ? err.message : t("error"),
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleUserAdded = () => {
    fetchUsers();
    setShowAddDialog(false);
    setEditingUser(null);
  };

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      ADMIN: "bg-red-100 text-red-800",
      MANAGER: "bg-blue-100 text-blue-800",
      CASHIER: "bg-green-100 text-green-800",
      VIEWER: "bg-gray-100 text-gray-800",
    };
    return colors[role] || "bg-gray-100 text-gray-800";
  };

  if (!isAdmin) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className="flex flex-col items-center justify-center p-8 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="h-8 w-8 text-amber-600 mb-2" />
          <p className="text-amber-800">{t("no_permission")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button
          onClick={() => { setEditingUser(null); setShowAddDialog(true); }}
          className="gap-2 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          <Plus className="h-4 w-4" />
          {t("add_user")}
        </Button>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive p-3 rounded-md flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <div className="border rounded-lg p-8 text-center">
          <p className="text-muted-foreground">{t("no_users")}</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>{t("username")}</TableHead>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("email")}</TableHead>
                <TableHead>{t("phone")}</TableHead>
                <TableHead>{t("role")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="text-right">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{user.email || "-"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{user.phone || "-"}</TableCell>
                  <TableCell>
                    <Badge className={getRoleColor(user.role)}>{user.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {user.isActive
                        ? <Check className="h-4 w-4 text-green-600" />
                        : <X className="h-4 w-4 text-red-600" />}
                      <span className={user.isActive ? "text-green-600" : "text-red-600"}>
                        {user.isActive ? t("active") : t("inactive")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setEditingUser(user); setShowAddDialog(true); }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirm(user)}
                      className="text-destructive hover:text-destructive"
                      disabled={user.role === "ADMIN"}
                      title={user.role === "ADMIN" ? t("admin_cannot_delete") : t("delete_user_tooltip")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {showAddDialog && (
        <AddUserDialog
          user={editingUser}
          onClose={() => { setShowAddDialog(false); setEditingUser(null); }}
          onSuccess={handleUserAdded}
        />
      )}

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete_user")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("delete_confirm", { name: deleteConfirm?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-md text-sm text-amber-800">
            {t("delete_note")}
          </div>
          <div className="flex items-center gap-2 justify-end">
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {t("deleting")}
                </>
              ) : (
                t("delete")
              )}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
