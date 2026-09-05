import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

const SUPPORTED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;
type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

function isSupportedMediaType(mt: string): mt is SupportedMediaType {
  return (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(mt);
}

const CATEGORY_KEYS = [
  "mantenimiento",
  "combustible",
  "amarre_marina_permisos",
  "otros_operativos",
] as const;

const INVOICE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    vendor: {
      type: ["string", "null"],
      description: "Nombre del proveedor o comercio, si figura en la factura",
    },
    date: {
      type: ["string", "null"],
      description: "Fecha de la factura en formato YYYY-MM-DD, si figura",
    },
    totalAmount: {
      type: ["number", "null"],
      description: "Monto total de la factura en dólares (USD), si se puede leer",
    },
    description: {
      type: ["string", "null"],
      description: "Descripción breve de qué es el gasto (ej. 'cambio de aceite', 'combustible')",
    },
    suggestedCategory: {
      type: ["string", "null"],
      enum: [...CATEGORY_KEYS, null],
      description:
        "Categoría más probable a partir del contenido de la factura. Null si no hay indicio claro.",
    },
  },
  required: ["vendor", "date", "totalAmount", "description", "suggestedCategory"],
  additionalProperties: false,
};

// Foto de factura en base64 (~10MB en bytes ≈ ~14M caracteres en base64)
const MAX_BASE64_LENGTH = 14_000_000;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Falta configurar ANTHROPIC_API_KEY en el servidor." },
      { status: 500 }
    );
  }

  let body: { imageBase64?: string; mediaType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const { imageBase64, mediaType } = body;
  if (!imageBase64 || !mediaType) {
    return NextResponse.json({ error: "Falta la imagen de la factura." }, { status: 400 });
  }
  if (!isSupportedMediaType(mediaType)) {
    return NextResponse.json({ error: "Formato de imagen no soportado." }, { status: 400 });
  }
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return NextResponse.json({ error: "La imagen es demasiado grande." }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      output_config: { format: { type: "json_schema", schema: INVOICE_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageBase64 },
            },
            {
              type: "text",
              text: "Esta es una factura o recibo de un gasto operativo de un barco de charter (mantenimiento, combustible, amarre/marina/permisos, u otro gasto operativo). Extraé el proveedor, la fecha, el monto total en USD y una descripción breve de qué es el gasto. Sugerí a qué categoría pertenece, solo si hay un indicio claro en el texto — nunca la inventes. Si no podés leer algún dato con confianza, dejalo en null en vez de inventarlo.",
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "No se pudo procesar la imagen." },
        { status: 422 }
      );
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "Respuesta vacía del modelo." }, { status: 502 });
    }

    const parsed = JSON.parse(textBlock.text);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("scan-invoice error", err);
    return NextResponse.json(
      { error: "No se pudo leer la factura. Probá con otra foto." },
      { status: 500 }
    );
  }
}
