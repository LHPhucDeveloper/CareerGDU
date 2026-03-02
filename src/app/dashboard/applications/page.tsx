"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/lib/auth-context"
import { FileText, Calendar, Building, Clock } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"

interface Application {
  _id: string
  jobId: string
  jobTitle: string
  companyName: string
  fullname: string
  email: string
  phone: string
  message: string
  cvOriginalName: string
  status: "new" | "reviewed" | "interviewed" | "rejected" | "hired"
  createdAt: string
}

export default function MyApplicationsPage() {
  const { user, isLoading } = useAuth()
  const { toast } = useToast()

  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)
  const [cvLoading, setCvLoading] = useState(false)
  const [cvUrl, setCvUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoading && user) {
      fetchApplications()
    }
  }, [isLoading, user])

  const fetchApplications = async () => {
    try {
      // Force fetching by email for everyone on this page
      const queryParams = new URLSearchParams()
      queryParams.set("email", user?.email || "")
      queryParams.set("role", "student") // API handles role=student as "filter by email"

      const res = await fetch(`/api/applications?${queryParams.toString()}`)
      const data = await res.json()

      if (data.success) {
        setApplications(data.data)
      }
    } catch (error) {
      console.error("Error fetching applications:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleViewCV = async (app: Application) => {
    setSelectedApp(app)
    setCvUrl(null)
    setCvLoading(true)

    try {
      const res = await fetch(`/api/applications/${app._id}`)
      const data = await res.json()

      if (data.success && data.data.cvBase64) {
        setCvUrl(data.data.cvBase64)
      } else {
        toast({
          title: "Lỗi",
          description: "Không thể tải CV",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error("Error fetching CV:", error)
    } finally {
      setCvLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Đã gửi hồ sơ</Badge>
      case "reviewed":
        return <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">Đã xem hồ sơ</Badge>
      case "interviewed":
        return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">Mời phỏng vấn</Badge>
      case "hired":
        return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Đã trúng tuyển</Badge>
      case "rejected":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Chưa phù hợp</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  if (isLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Việc làm đã ứng tuyển</h1>
          <p className="text-muted-foreground mt-2">
            Theo dõi trạng thái và kết quả ứng tuyển các vị trí của bạn
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Đơn ứng tuyển của bạn ({applications.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {applications.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">Chưa có hồ sơ nào</h3>
              <p className="text-gray-500">Bạn chưa nộp hồ sơ vào vị trí nào.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vị trí & Doanh nghiệp</TableHead>
                    <TableHead>Ngày nộp</TableHead>
                    <TableHead>Hồ sơ đã nộp</TableHead>
                    <TableHead>Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applications.map((app) => (
                    <TableRow key={app._id}>
                      <TableCell>
                        <div className="font-bold text-[#1e3a5f]">{app.jobTitle}</div>
                        <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                          <Building className="h-3 w-3" />
                          {app.companyName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Calendar className="h-3 w-3" />
                          {new Date(app.createdAt).toLocaleDateString("vi-VN")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-blue-600 h-auto p-0 hover:bg-transparent"
                          onClick={() => handleViewCV(app)}
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          {app.cvOriginalName || "Xem CV"}
                        </Button>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(app.status)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedApp} onOpenChange={(open) => !open && setSelectedApp(null)}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>CV của bạn: {selectedApp?.jobTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 bg-gray-100 rounded-md overflow-hidden relative">
            {cvLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : cvUrl ? (
              <iframe
                src={cvUrl}
                className="w-full h-full"
                title="CV Preview"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                Không thể hiển thị CV
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
