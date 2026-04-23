:8080 {
	encode zstd gzip

	@api path /api/*
	reverse_proxy @api api:3001

	root * /srv
	try_files {path} /index.html
	file_server
}
