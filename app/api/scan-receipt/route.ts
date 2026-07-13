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

const RECEIPT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    supplier: {
      type: ["string", "null"],
      description: "Nombre del proveedor o comercio, si figura en el ticket",
    },
    date: {
      type: ["string", "null"],
      description: "Fecha de la compra en formato YYYY-MM-DD, si figura en el ticket",
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "Nombre del producto tal como aparece en el ticket",
          },
          quantity: { type: "number", description: "Cantidad comprada" },
          unit: {
            type: ["string", "null"],
            description: "Unidad si se puede inferir (kg, g, l, ml, unidad, etc.)",
          },
          totalPrice: {
            type: "number",
            description: "Precio total de la línea (cantidad × precio unitario)",
          },
        },
        required: ["description", "quantity", "unit", "totalPrice"],
        additionalProperties: false,
      },
    },
  },
  required: ["supplier", "date", "items"],
  additionalProperties: false,
};

// Foto de ticket en base64 (~10MB en bytes ≈ ~14M caracteres en base64)
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
    return NextResponse.json({ error: "Falta la imagen del ticket." }, { status: 400 });
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
      model: "claude-opus-4-8",
      max_tokens: 4096,
      output_config: { format: { type: "json_schema", schema: RECEIPT_SCHEMA } },
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
              text: "Este es un ticket o factura de compra de insumos para un charter náutico. Extraé cada ítem comprado con su cantidad y el precio total de esa línea. Si un renglón tiene precio unitario y cantidad pero no precio total, calculalo vos. Ignorá totales, subtotales, impuestos, descuentos y método de pago como si fueran ítems — solo productos comprados. Si no podés leer algún dato con confianza, dejalo en null en vez de inventarlo.",
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
    console.error("scan-receipt error", err);
    return NextResponse.json(
      { error: "No se pudo leer el ticket. Probá con otra foto." },
      { status: 500 }
    );
  }
}
