FROM quay.io/sampandey001/md:latest
RUN git clone https://AshishKumar9532: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@github.com/AshishKumar9532/qrrr/ /app
WORKDIR /app
RUN yarn install && yarn add http
EXPOSE 8000
CMD ["pm2", "sam.js"]
