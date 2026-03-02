import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import { ObjectId } from "mongodb"
import { sendEmail } from "@/services/email.service"
import { getInterviewEmailTemplate, getRejectedEmailTemplate, getHiredEmailTemplate } from "@/lib/email-templates"
import { checkNotificationPreference } from "@/lib/notification-utils"

// GET - Get application details by ID (including CV)
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const { cookies } = await import("next/headers")
        const { decrypt } = await import("@/lib/session")
        const cookieStore = await cookies()
        const sessionCookie = cookieStore.get("session")?.value
        const session = await decrypt(sessionCookie)

        if (!session || !session.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const userId = session.userId as string
        const userRole = session.role as string

        const collection = await getCollection(COLLECTIONS.APPLICATIONS)
        const application = await collection.findOne({ _id: new ObjectId(id) })

        if (!application) {
            return NextResponse.json({ error: "Application not found" }, { status: 404 })
        }

        // Authorization check
        const isAdmin = userRole === 'admin'
        const isEmployer = userRole === 'employer' && (application.employerId === userId || application.employerId?.toString() === userId)
        const isStudent = userRole === 'student' && (application.applicantId === userId || application.applicantId?.toString() === userId)

        if (!isAdmin && !isEmployer && !isStudent) {
            return NextResponse.json({ error: "Forbidden: You don't have access to this application" }, { status: 403 })
        }

        return NextResponse.json({
            success: true,
            data: application
        })
    } catch (error) {
        console.error("Error fetching application:", error)
        return NextResponse.json({ error: "Failed to fetch application" }, { status: 500 })
    }
}

// PATCH - Update application status
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const { cookies } = await import("next/headers")
        const { decrypt } = await import("@/lib/session")
        const cookieStore = await cookies()
        const sessionCookie = cookieStore.get("session")?.value
        const session = await decrypt(sessionCookie)

        if (!session || !session.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const userId = session.userId as string
        const userRole = session.role as string

        const body = await request.json()
        const { status, notes } = body // Removed updaterId, updaterRole - we use session!

        if (!id || !ObjectId.isValid(id)) {
            return NextResponse.json({ error: "Invalid application ID" }, { status: 400 })
        }

        const validStatuses = ["new", "reviewed", "interviewed", "rejected", "hired"]
        if (status && !validStatuses.includes(status)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 })
        }

        const collection = await getCollection(COLLECTIONS.APPLICATIONS)

        // Fetch application before update to check permissions and get metadata
        const currentApplication = await collection.findOne({ _id: new ObjectId(id) })
        if (!currentApplication) {
            return NextResponse.json({ error: "Application not found" }, { status: 404 })
        }

        // Authorization check
        const isAdmin = userRole === 'admin'
        const isOwner = userRole === 'employer' && (currentApplication.employerId === userId || currentApplication.employerId?.toString() === userId)

        console.log(`[Auth Debug] App: ${id}, SessionUser: ${userId}, Role: ${userRole}, AppOwner: ${currentApplication.employerId}`)

        if (!isAdmin && !isOwner) {
            console.log("[Auth Debug] ACCESS DENIED")
            return NextResponse.json({ error: "Bạn không có quyền cập nhật trạng thái này" }, { status: 403 })
        }

        // Logic check: Enforce hiring limit
        if (status === "hired" && currentApplication.status !== "hired") {
            try {
                const jobsCollection = await getCollection(COLLECTIONS.JOBS)
                const jobId = currentApplication.jobId

                let job = null
                if (ObjectId.isValid(jobId)) {
                    job = await jobsCollection.findOne({ _id: new ObjectId(jobId) })
                } else {
                    job = await jobsCollection.findOne({ _id: jobId })
                }

                if (job) {
                    // quantity -1 means unlimited
                    if (job.quantity && job.quantity > 0) {
                        const hiredCount = await collection.countDocuments({
                            jobId: jobId,
                            status: "hired"
                        })

                        console.log(`[Limit Check] Job: ${jobId}, Quantity: ${job.quantity}, Hired: ${hiredCount}`)

                        if (hiredCount >= job.quantity) {
                            return NextResponse.json({
                                error: `Đã tuyển đủ số lượng (${job.quantity} người). Không thể tuyển thêm.`
                            }, { status: 400 })
                        }
                    }
                }
            } catch (err) {
                console.error("Error checking hiring limit:", err)
            }
        }

        const updateData: Record<string, any> = {
            updatedAt: new Date()
        }
        if (status) updateData.status = status
        if (notes !== undefined) updateData.notes = notes

        await collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        )

        // Create notification for student if status changed and applicantId exists
        if (status && status !== currentApplication.status && currentApplication.applicantId) {
            try {
                const notificationsCollection = await getCollection(COLLECTIONS.NOTIFICATIONS)
                const jobTitle = currentApplication.jobTitle || "công việc"

                let notificationTitle = ""
                let notificationMessage = ""
                let notificationType: "job" | "interview" | "system" = "job"

                switch (status) {
                    case "reviewed":
                        notificationTitle = "Hồ sơ đã được xem"
                        notificationMessage = `Nhà tuyển dụng đã xem hồ sơ của bạn cho vị trí ${jobTitle}.`
                        break
                    case "interviewed":
                        notificationTitle = "Mời phỏng vấn"
                        notificationMessage = `Bạn có lời mời phỏng vấn cho vị trí ${jobTitle}. Vui lòng kiểm tra email hoặc điện thoại để biết chi tiết.`
                        notificationType = "interview"
                        break
                    case "hired":
                        notificationTitle = "Chúc mừng!"
                        notificationMessage = `Chúc mừng! Bạn đã được nhận vào vị trí ${jobTitle}.`
                        break
                    case "rejected":
                        notificationTitle = "Kết quả ứng tuyển"
                        notificationMessage = `Cảm ơn bạn đã quan tâm. Rất tiếc hồ sơ vị trí ${jobTitle} chưa phù hợp lần này. Hẹn bạn ở cơ hội khác nhé!`
                        break
                }

                if (notificationTitle) {
                    await notificationsCollection.insertOne({
                        userId: currentApplication.applicantId,
                        type: notificationType,
                        title: notificationTitle,
                        message: notificationMessage,
                        read: false,
                        createdAt: new Date(),
                        link: `/dashboard/applications`,
                        applicationId: id
                    })
                    console.log(`[Applications API] Created ${status} notification for student:`, currentApplication.applicantId)
                }

                // --- Send Email Notification to Candidate ---
                if (["interviewed", "rejected", "hired"].includes(status)) {
                    const candidateEmail = currentApplication.email
                    const candidateName = currentApplication.fullname
                    const jobTitle = currentApplication.jobTitle

                    let emailSubject = ""
                    let emailHtml = ""

                    if (status === "interviewed") {
                        emailSubject = `[GDU Career] Mời phỏng vấn vị trí: ${jobTitle}`
                        emailHtml = getInterviewEmailTemplate(candidateName, jobTitle)
                    } else if (status === "rejected") {
                        emailSubject = `[GDU Career] Kết quả ứng tuyển vị trí: ${jobTitle}`
                        emailHtml = getRejectedEmailTemplate(candidateName, jobTitle)
                    } else if (status === "hired") {
                        emailSubject = `[GDU Career] Chúc mừng bạn đã trúng tuyển vị trí: ${jobTitle}`
                        emailHtml = getHiredEmailTemplate(candidateName, jobTitle)
                    }

                    if (emailSubject && candidateEmail) {
                        // Check student's email preference
                        const shouldSendEmail = await checkNotificationPreference(currentApplication.applicantId, 'email')

                        if (shouldSendEmail) {
                            sendEmail({
                                to: candidateEmail,
                                subject: emailSubject,
                                html: emailHtml
                            }).catch(err => console.error("Async email sending failed:", err))
                        } else {
                            console.log(`[Applications API] Email skipped for ${candidateEmail} (preference off)`)
                        }
                    }
                }
            } catch (notifError) {
                console.error("Failed to create student status notification:", notifError)
                // Don't fail the main request if notification fails
            }
        }

        return NextResponse.json({
            success: true,
            message: "Application updated successfully"
        })
    } catch (error) {
        console.error("Error updating application:", error)
        return NextResponse.json({ error: "Failed to update application" }, { status: 500 })
    }
}

// DELETE - Delete application
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params

        const { cookies } = await import("next/headers")
        const { decrypt } = await import("@/lib/session")
        const cookieStore = await cookies()
        const sessionCookie = cookieStore.get("session")?.value
        const session = await decrypt(sessionCookie)

        if (!session || !session.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const userId = session.userId as string
        const userRole = session.role as string

        if (!id || !ObjectId.isValid(id)) {
            return NextResponse.json({ error: "Invalid application ID" }, { status: 400 })
        }

        const collection = await getCollection(COLLECTIONS.APPLICATIONS)
        const application = await collection.findOne({ _id: new ObjectId(id) })

        if (!application) {
            return NextResponse.json({ error: "Application not found" }, { status: 404 })
        }

        // Authorization check: Only Admin or the Employer who owns the job can delete?
        // Actually, usually only Admin can delete applications in this type of system
        // unless employer needs to "archive" them. Let's stick with Admin or Job Owner.
        const isAdmin = userRole === 'admin'
        const isOwner = userRole === 'employer' && (application.employerId === userId || application.employerId?.toString() === userId)

        if (!isAdmin && !isOwner) {
            return NextResponse.json({ error: "Forbidden: You don't have permission to delete this application" }, { status: 403 })
        }

        await collection.deleteOne({ _id: new ObjectId(id) })

        return NextResponse.json({
            success: true,
            message: "Application deleted successfully"
        })
    } catch (error) {
        console.error("Error deleting application:", error)
        return NextResponse.json({ error: "Failed to delete application" }, { status: 500 })
    }
}
