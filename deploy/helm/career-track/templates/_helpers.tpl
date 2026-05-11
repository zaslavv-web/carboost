{{- define "ct.name" -}}{{ .Chart.Name }}{{- end -}}
{{- define "ct.fullname" -}}{{ .Release.Name }}-{{ .Chart.Name }}{{- end -}}
{{- define "ct.labels" -}}
app.kubernetes.io/name: {{ include "ct.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}
