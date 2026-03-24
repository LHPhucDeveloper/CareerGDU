import { NextResponse } from "next/server"
import prisma from "@/database/prisma"

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const body = await req.json()
        const { status, adminFeedback } = body

        const allowedStatus = ["active", "rejected", "pending"]

        if (!status || !allowedStatus.includes(status)) {
            return NextResponse.json(
                { error: "Trạng thái không hợp lệ" },
                { status: 400 }
            )
        }

        if (status === "rejected" && (!adminFeedback || adminFeedback.trim() === "")) {
            return NextResponse.json(
                { error: "Lý do từ chối là bắt buộc" },
                { status: 400 }
            )
        }

        const job = await prisma.job.findUnique({
            where: { id }
        })

        if (!job) {
            return NextResponse.json(
                { error: "Job không tồn tại" },
                { status: 404 }
            )
        }

        const data: any = { status }

        if (adminFeedback !== undefined) {
            data.adminFeedback = adminFeedback
        }

        if (status === "active") {
            data.postedAt = new Date()
        }

        await prisma.job.update({
            where: { id },
            data
        })

        return NextResponse.json({
            success: true
        })

    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error?.message },
            { status: 500 }
        )
    }
}