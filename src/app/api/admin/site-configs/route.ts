import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import { ObjectId } from "mongodb"

export async function GET() {
    try {
        const collection = await getCollection(COLLECTIONS.SITE_CONFIGS)
        const configs = await collection.find({}).toArray()
        return NextResponse.json({
            success: true,
            data: configs.map(c => ({ ...c, _id: c._id.toString() }))
        })
    } catch (error) {
        return NextResponse.json({ success: false, error: "Failed to fetch configs" }, { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { id, key, title, description, hotTags, isActive } = body

        if (!key) return NextResponse.json({ success: false, error: "Missing key" }, { status: 400 })

        const collection = await getCollection(COLLECTIONS.SITE_CONFIGS)

        const updateData = {
            key,
            title,
            description,
            hotTags: Array.isArray(hotTags) ? hotTags : hotTags.split(",").map((t: string) => t.trim()).filter(Boolean),
            isActive: isActive ?? true,
            updatedAt: new Date()
        }

        if (id) {
            await collection.updateOne(
                { _id: new ObjectId(id) },
                { $set: updateData }
            )
        } else {
            await collection.updateOne(
                { key },
                { $set: { ...updateData, createdAt: new Date() } },
                { upsert: true }
            )
        }

        return NextResponse.json({ success: true, message: "Lưu cấu hình thành công" })
    } catch (error) {
        console.error("Error saving site config:", error)
        return NextResponse.json({ success: false, error: "Failed to save config" }, { status: 500 })
    }
}
