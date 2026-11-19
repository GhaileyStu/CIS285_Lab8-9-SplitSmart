"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { addGroupMember, createGroup, deactivateGroupMember, updateGroup } from "@/lib/groups/service";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function createGroupAction(formData: FormData) {
  const user = await requireUser();
  let message: string | null = null;
  let groupId = "";
  try {
    const group = await createGroup(user.id, text(formData, "name"), text(formData, "currencyCode"));
    groupId = group.id;
  } catch (error) {
    message = error instanceof Error ? error.message : "Could not create group.";
  }
  if (message) redirect(`/?error=${encodeURIComponent(message)}`);
  redirect(`/?group=${encodeURIComponent(groupId)}&notice=Group%20created.`);
}

export async function addMemberAction(formData: FormData) {
  const user = await requireUser();
  const groupId = text(formData, "groupId");
  let message: string | null = null;
  try {
    await addGroupMember(user.id, groupId, text(formData, "username"));
  } catch (error) {
    message = error instanceof Error ? error.message : "Could not add that member.";
  }
  if (message) redirect(`/?group=${encodeURIComponent(groupId)}&error=${encodeURIComponent(message)}`);
  redirect(`/?group=${encodeURIComponent(groupId)}&notice=Member%20added.`);
}

export async function deactivateMemberAction(formData: FormData) {
  const user = await requireUser();
  const groupId = text(formData, "groupId");
  let message: string | null = null;
  try {
    await deactivateGroupMember(user.id, groupId, text(formData, "memberUserId"));
  } catch (error) {
    message = error instanceof Error ? error.message : "Could not update membership.";
  }
  if (message) redirect(`/?group=${encodeURIComponent(groupId)}&error=${encodeURIComponent(message)}`);
  redirect(`/?group=${encodeURIComponent(groupId)}&notice=Membership%20updated.`);
}

export async function updateGroupAction(formData: FormData) {
  const user = await requireUser();
  const groupId = text(formData, "groupId");
  let message: string | null = null;
  try {
    await updateGroup(user.id, groupId, text(formData, "name"), text(formData, "currencyCode"));
  } catch (error) {
    message = error instanceof Error ? error.message : "Could not update the group.";
  }
  if (message) redirect(`/?group=${encodeURIComponent(groupId)}&error=${encodeURIComponent(message)}`);
  redirect(`/?group=${encodeURIComponent(groupId)}&notice=Group%20settings%20saved.`);
}
