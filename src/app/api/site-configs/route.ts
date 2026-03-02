import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const key = searchParams.get("key")

        const collection = await getCollection(COLLECTIONS.SITE_CONFIGS)

        if (key) {
            const config = await collection.findOne({ key, isActive: true })
            return NextResponse.json({
                success: true,
                data: config ? { ...config, _id: config._id.toString() } : null
            })
        }

        const configs = await collection.find({ isActive: true }).toArray()

        return NextResponse.json({
            success: true,
            data: configs.map(c => ({ ...c, _id: c._id.toString() }))
        })
    } catch (error) {
        console.error("Error fetching site configs:", error)
        return NextResponse.json({ success: false, error: "Failed to fetch configurations" }, { status: 500 })
    }
}
