export const apiRoutes = {
  auth: {
    login: "/auth/login",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    me: "/auth/me",
    forgotPassword: "/auth/forgot-password",
    resetPassword: "/auth/reset-password",
    changePassword: "/auth/change-password",
    updateProfile: "/auth/me",
    avatar: "/auth/me/avatar",
    signature: "/auth/me/signature",
    signatureRequest: "/auth/me/signature/request",
  },
  health: "/health",
  reference: {
    countries: "/countries",
  },
  users: {
    list: "/users",
    resetPassword: (id: number) => `/users/${id}/reset-password`,
  },
} as const;
