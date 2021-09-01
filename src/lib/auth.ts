// This module is used to store Firefly authentication token

const authTokens = new Map()
authTokens.set(169160135, process.env.AUTH_TOKEN)

export function getToken(userId: number) {
  return authTokens.get(userId)
}

export function setToken(userId: number, token: string) {
  return authTokens.set(userId, token)
}
