using System;
using System.IO;
using System.Text;

internal static class InfraHubTvNativeHost
{
    private const int MaxMessageBytes = 1024 * 1024;

    private static byte[] ReadExact(Stream stream, int count)
    {
        byte[] buffer = new byte[count];
        int offset = 0;
        while (offset < count)
        {
            int read = stream.Read(buffer, offset, count - offset);
            if (read <= 0)
            {
                if (offset == 0) return null;
                throw new EndOfStreamException("Mensagem nativa incompleta.");
            }
            offset += read;
        }
        return buffer;
    }

    private static int Main()
    {
        try
        {
            Stream input = Console.OpenStandardInput();
            byte[] header = ReadExact(input, 4);
            if (header == null) return 0;

            int requestLength = BitConverter.ToInt32(header, 0);
            if (requestLength < 0 || requestLength > MaxMessageBytes)
                throw new InvalidDataException("Tamanho de mensagem inválido.");

            byte[] request = ReadExact(input, requestLength);
            if (request == null) throw new EndOfStreamException("Requisição vazia.");

            string identityPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "InfraHubTV",
                "identity.json"
            );
            if (!File.Exists(identityPath))
                throw new FileNotFoundException("Identidade InfraHub TV não encontrada.");

            string json = File.ReadAllText(identityPath, Encoding.UTF8);
            byte[] payload = new UTF8Encoding(false).GetBytes(json);
            if (payload.Length > MaxMessageBytes)
                throw new InvalidDataException("Resposta de identidade muito grande.");

            Stream output = Console.OpenStandardOutput();
            byte[] responseHeader = BitConverter.GetBytes(payload.Length);
            output.Write(responseHeader, 0, responseHeader.Length);
            output.Write(payload, 0, payload.Length);
            output.Flush();
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("[InfraHub TV Native Host] " + ex.Message);
            return 1;
        }
    }
}
