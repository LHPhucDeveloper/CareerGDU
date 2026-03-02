import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import { ObjectId } from "mongodb"

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const limit = parseInt(searchParams.get("limit") || "20")
        const category = searchParams.get("category")
        const id = searchParams.get("id")

        const collection = await getCollection(COLLECTIONS.NEWS)

        if (id) {
            const item = await collection.findOne({ _id: new ObjectId(id) })
            if (!item) return NextResponse.json({ success: false, error: "News not found" }, { status: 404 })
            return NextResponse.json({ success: true, data: { ...item, _id: item._id.toString() } })
        }

        let query: any = {}
        if (category && category !== "all" && category !== "Tất cả") {
            query.category = { $regex: category, $options: 'i' }
        }

        const news = await collection
            .find(query)
            .sort({ publishedAt: -1 })
            .limit(limit)
            .toArray()

        const mappedNews = news.map(item => ({
            ...item,
            _id: item._id.toString()
        }))

        return NextResponse.json({
            success: true,
            data: mappedNews
        })
    } catch (error) {
        console.error("Error fetching news:", error)
        return NextResponse.json(
            { success: false, error: "Failed to fetch news" },
            { status: 500 }
        )
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const collection = await getCollection(COLLECTIONS.NEWS)

        const newsItem = {
            ...body,
            publishedAt: new Date().toISOString(),
            views: 0,
            slug: body.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w ]+/g, '').replace(/ +/g, '-'),
        }

        const result = await collection.insertOne(newsItem)

        return NextResponse.json({
            success: true,
            data: { ...newsItem, _id: result.insertedId.toString() }
        })
    } catch (error) {
        console.error("Error creating news:", error)
        return NextResponse.json(
            { success: false, error: "Failed to create news" },
            { status: 500 }
        )
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const id = searchParams.get("id")
        if (!id) return NextResponse.json({ success: false, error: "Missing ID" }, { status: 400 })

        const collection = await getCollection(COLLECTIONS.NEWS)
        await collection.deleteOne({ _id: new ObjectId(id) })

        return NextResponse.json({ success: true, message: "News deleted successfully" })
    } catch (error) {
        console.error("Error deleting news:", error)
        return NextResponse.json(
            { success: false, error: "Failed to delete news" },
            { status: 500 }
        )
    }
}

export async function PATCH(req: Request) {
    try {
        const body = await req.json()
        const { _id, ...updateData } = body
        if (!_id) return NextResponse.json({ success: false, error: "Missing ID" }, { status: 400 })

        const collection = await getCollection(COLLECTIONS.NEWS)
        await collection.updateOne(
            { _id: new ObjectId(_id) },
            { $set: updateData }
        )

        return NextResponse.json({ success: true, message: "News updated successfully" })
    } catch (error) {
        console.error("Error updating news:", error)
        return NextResponse.json(
            { success: false, error: "Failed to update news" },
            { status: 500 }
        )
    }
}
