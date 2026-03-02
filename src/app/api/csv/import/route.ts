import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File
    const type = formData.get("type") as string // "jobs" | "reviews" | "users"

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 })
    }

    const text = await file.text()
    const lines = text.split("\n")
    const headers = lines[0].split(",").map((h) => h.trim())

    const records = []
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue

      const values = lines[i].split(",")
      const record: Record<string, string> = {}

      headers.forEach((header, index) => {
        record[header] = values[index]?.trim() || ""
      })

      records.push(record)
    }

    // In production with MongoDB:
    // const collection = await getCollection(type)
    // await collection.insertMany(records)

    return NextResponse.json({
      success: true,
      message: `Imported ${records.length} records successfully`,
      data: {
        type,
        count: records.length,
        sample: records.slice(0, 3),
      },
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to import CSV" }, { status: 500 })
  }
}
