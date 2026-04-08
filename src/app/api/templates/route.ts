import { NextRequest, NextResponse } from "next/server";
import {
  TEMPLATES,
  resolveTemplateProducts,
  templateMeta,
} from "@/lib/templates";

// GET /api/templates           → list of template metadata (no terms)
// GET /api/templates?id=<id>   → resolved products for that template
export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ templates: TEMPLATES.map(templateMeta) });
    }

    const template = TEMPLATES.find((t) => t.id === id);
    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    const products = await resolveTemplateProducts(template);
    return NextResponse.json({ products });
  } catch (error) {
    console.error("Templates error:", error);
    return NextResponse.json(
      { error: "Error fetching templates" },
      { status: 500 }
    );
  }
}
