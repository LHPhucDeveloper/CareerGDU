import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import { ObjectId } from "mongodb"

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params

        if (!ObjectId.isValid(id)) {
            return NextResponse.json({ error: "Invalid job ID" }, { status: 400 })
        }

        const collection = await getCollection(COLLECTIONS.JOBS)

        await collection.updateOne(
            { _id: new ObjectId(id) },
            { $inc: { views: 1 } }
        )

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Increment view error:", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
