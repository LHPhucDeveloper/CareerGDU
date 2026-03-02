import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import { ObjectId } from "mongodb"

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: applicationId } = await params
        console.log(`[CV API] Serving CV for application: ${applicationId}`)

        if (!ObjectId.isValid(applicationId)) {
            console.warn(`[CV API] Invalid Application ID: ${applicationId}`)
            return new Response("Invalid Application ID", { status: 400 })
        }

        const collection = await getCollection(COLLECTIONS.APPLICATIONS)
        const application = await collection.findOne({ _id: new ObjectId(applicationId) })

        if (!application) {
            console.warn(`[CV API] Application not found: ${applicationId}`)
            return new Response("Application not found", { status: 404 })
        }

        if (!application.cvBase64) {
            console.warn(`[CV API] CV file not found for application: ${applicationId}`)
            return new Response("CV file not found for this application", { status: 404 })
        }

        // Parse data URI: data:[<mediatype>][;base64],<data>
        // Example: "data:application/pdf;base64,JVBERi0xLjQK..."
        const matches = application.cvBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)

        if (!matches || matches.length !== 3) {
            console.error(`[CV API] Invalid CV file format (regex failed) for application: ${applicationId}`)
            return new Response("Invalid CV file format", { status: 500 })
        }

        const contentType = matches[1]
        const base64Data = matches[2]
        const buffer = Buffer.from(base64Data, 'base64')

        // Use 'inline' to try to open in browser (e.g. PDF), 'attachment' to force download
        const filename = application.cvOriginalName || 'cv.pdf'
        const encodedFilename = encodeURIComponent(filename)

        return new Response(buffer, {
            headers: {
                "Content-Type": contentType,
                "Content-Disposition": `inline; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
                "Content-Length": buffer.length.toString(),
            },
        })
    } catch (error: any) {
        console.error("[CV API] CRITICAL ERROR serving CV:", error)
        return new Response(`Internal Server Error: ${error.message || 'Unknown error'}`, { status: 500 })
    }
}
