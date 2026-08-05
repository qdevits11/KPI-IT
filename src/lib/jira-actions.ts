/**
 * Actions d’écriture Jira : transition de statut, assignation, catégorie.
 */

import type { JiraConnection } from "./jira-auth";
import { jiraApiFetch } from "./jira";
import { resolveFreshJiraConnection } from "./jira-oauth";
import { pickAvatarUrl } from "./avatars";

export interface JiraTransitionOption {
  id: string;
  name: string;
  toStatus: string;
}

export interface JiraAssignableUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  avatarUrl?: string;
}

export interface JiraCategoryOption {
  id: string;
  value: string;
}

export interface IssueActionMeta {
  key: string;
  summary: string;
  status: string;
  assigneeAccountId: string | null;
  assigneeName: string;
  assigneeAvatarUrl?: string;
  category: string | null;
  transitions: JiraTransitionOption[];
  assignable: JiraAssignableUser[];
  categories: JiraCategoryOption[];
  categoryFieldId: string;
  canEditCategory: boolean;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

async function requireConn(conn?: JiraConnection | null): Promise<JiraConnection> {
  const c = conn ?? (await resolveFreshJiraConnection());
  if (!c) {
    throw new Error(
      "Compte Jira requis. Connectez-vous via Atlassian (Microsoft) ou token API.",
    );
  }
  return c;
}

export async function getIssueActionMeta(
  issueKey: string,
  conn?: JiraConnection | null,
): Promise<IssueActionMeta> {
  const c = await requireConn(conn);
  const key = issueKey.trim().toUpperCase();
  const catField = c.categoryCustomFieldId || "customfield_10152";

  const [issueRes, transRes, assignRes, editRes] = await Promise.all([
    jiraApiFetch(
      c,
      `/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,status,assignee,${catField}`,
    ),
    jiraApiFetch(
      c,
      `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`,
    ),
    jiraApiFetch(
      c,
      `/rest/api/3/user/assignable/search?issueKey=${encodeURIComponent(key)}&maxResults=50`,
    ),
    jiraApiFetch(
      c,
      `/rest/api/3/issue/${encodeURIComponent(key)}/editmeta`,
    ),
  ]);

  if (!issueRes.ok) {
    throw new Error(`Lecture ticket ${key} HTTP ${issueRes.status}`);
  }

  const issue = (await issueRes.json()) as {
    key: string;
    fields: {
      summary?: string;
      status?: { name?: string };
      assignee?: {
        accountId?: string;
        displayName?: string;
        avatarUrls?: Record<string, string>;
      } | null;
      [k: string]: unknown;
    };
  };

  const transitionsJson = transRes.ok
    ? ((await transRes.json()) as {
        transitions?: Array<{
          id: string;
          name: string;
          to?: { name?: string };
        }>;
      })
    : { transitions: [] };

  const assignable = assignRes.ok
    ? (((await assignRes.json()) as Array<{
        accountId?: string;
        displayName?: string;
        emailAddress?: string;
        avatarUrls?: Record<string, string>;
      }>) ?? [])
    : [];

  const editmeta = editRes.ok
    ? ((await editRes.json()) as {
        fields?: Record<
          string,
          {
            name?: string;
            allowedValues?: Array<{ id?: string; value?: string; name?: string }>;
          }
        >;
      })
    : { fields: {} };

  const catMeta = editmeta.fields?.[catField];
  const categories: JiraCategoryOption[] = (catMeta?.allowedValues ?? [])
    .map((v) => ({
      id: String(v.id ?? v.value ?? v.name ?? ""),
      value: String(v.value ?? v.name ?? v.id ?? ""),
    }))
    .filter((v) => v.value);

  const rawCat = issue.fields[catField];
  let category: string | null = null;
  if (typeof rawCat === "string") category = rawCat;
  else {
    const obj = asRecord(rawCat);
    if (obj) {
      category =
        (typeof obj.value === "string" && obj.value) ||
        (typeof obj.name === "string" && obj.name) ||
        null;
    }
  }

  return {
    key: issue.key,
    summary: issue.fields.summary ?? "",
    status: issue.fields.status?.name ?? "—",
    assigneeAccountId: issue.fields.assignee?.accountId ?? null,
    assigneeName: issue.fields.assignee?.displayName ?? "Non assigné",
    assigneeAvatarUrl: pickAvatarUrl(issue.fields.assignee?.avatarUrls),
    category,
    transitions: (transitionsJson.transitions ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      toStatus: t.to?.name ?? t.name,
    })),
    assignable: assignable
      .filter((u) => u.accountId)
      .map((u) => ({
        accountId: u.accountId!,
        displayName: u.displayName || u.emailAddress || u.accountId!,
        emailAddress: u.emailAddress,
        avatarUrl: pickAvatarUrl(u.avatarUrls),
      })),
    categories,
    categoryFieldId: catField,
    canEditCategory: Boolean(catMeta),
  };
}

export async function transitionIssue(
  issueKey: string,
  transitionId: string,
  conn?: JiraConnection | null,
): Promise<void> {
  const c = await requireConn(conn);
  const res = await jiraApiFetch(
    c,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
    {
      method: "POST",
      body: JSON.stringify({ transition: { id: transitionId } }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Transition échouée HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }
}

/** accountId null → désassigner */
export async function assignIssue(
  issueKey: string,
  accountId: string | null,
  conn?: JiraConnection | null,
): Promise<void> {
  const c = await requireConn(conn);
  const res = await jiraApiFetch(
    c,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/assignee`,
    {
      method: "PUT",
      body: JSON.stringify(
        accountId ? { accountId } : { accountId: null },
      ),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Assignation échouée HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }
}

export async function setIssueCategory(
  issueKey: string,
  categoryValue: string,
  conn?: JiraConnection | null,
): Promise<void> {
  const c = await requireConn(conn);
  const fieldId = c.categoryCustomFieldId || "customfield_10152";
  const meta = await getIssueActionMeta(issueKey, c);
  const option = meta.categories.find(
    (o) => o.value === categoryValue || o.id === categoryValue,
  );

  const fieldValue = option
    ? { id: option.id }
    : { value: categoryValue };

  const res = await jiraApiFetch(
    c,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        fields: {
          [fieldId]: fieldValue,
        },
      }),
    },
  );
  if (!res.ok) {
    // Retry with plain string for some field configs
    const retry = await jiraApiFetch(
      c,
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          fields: { [fieldId]: categoryValue },
        }),
      },
    );
    if (!retry.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Catégorie échouée HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      );
    }
  }
}
