import { askMessageBodySchema } from "@cnpaf/shared";
import { addAskMessage } from "@/lib/ask-collect";
import { jsonError, privateNoStoreJson, requireAnyPermission } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireAnyPermission(["chat.ask_collect", "ask_collect.use"]);
  if (error || !user) return error;
  const contentType = req.headers.get("content-type") ?? "";
  const formData = contentType.includes("multipart/form-data") ? await req.formData() : null;
  const parsed = askMessageBodySchema.safeParse(formData
    ? {
        content: formData.get("content"),
        modelName: formData.get("modelName") || undefined,
        privacyAttested: formData.get("privacyAttested") === "true",
      }
    : await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  try {
    const files = formData
      ? formData.getAll("files").filter((item): item is File => item instanceof File)
      : [];
    if (files.length > 5) return jsonError("A message can include at most 5 attachments", 413);
    if (files.some((file) => file.size > 10 * 1024 * 1024)) return jsonError("Each attachment must be 10 MB or smaller", 413);
    if (files.reduce((sum, file) => sum + file.size, 0) > 25 * 1024 * 1024) return jsonError("Attachments exceed the 25 MB combined limit", 413);
    return privateNoStoreJson(await addAskMessage(
      (await params).id,
      user.id,
      parsed.data.content,
      {
        modelName: parsed.data.modelName,
        privacyAttested: parsed.data.privacyAttested,
        files: await Promise.all(files.map(async (file) => ({
          name: file.name,
          mimeType: file.type,
          body: Buffer.from(await file.arrayBuffer()),
        }))),
      },
    ), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not answer question";
    const status = message === "Conversation not found"
      ? 404
      : /personal information|file|attachment|model|de-identified|10 MB|25 MB/i.test(message)
        ? 400
        : 409;
    return jsonError(message, status);
  }
}
